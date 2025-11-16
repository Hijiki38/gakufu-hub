import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  PanResponderInstance,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getUrl, list, uploadData } from "aws-amplify/storage";
import { post } from "aws-amplify/api";
import { WebView } from "react-native-webview";
import type { WebViewSource } from "react-native-webview/lib/WebViewTypes";
import Svg, { Path } from "react-native-svg";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PDFDocument, LineCapStyle, rgb } from "pdf-lib";
import { buildS3Path, PART_LABELS, PartType } from "../../types";

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  id: string;
  color: string;
  width: number;
  points: Point[];
  pageIndex: number;
};

const TOOL_COLORS = ["#ff4d6d", "#1d4ed8", "#0f172a"];
const STORAGE_KEY_PREFIX = "score-editor:strokes:";
const DEFAULT_PAGE_INDEX = 0;
const MAX_UNDO = 50;
const ERASER_RADIUS = 0.03; // Normalized radius (0-1) used to detect hit strokes

type DrawingTool = "pen" | "eraser";

let outputs: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  outputs = require("../../amplify_outputs.json");
} catch {
  console.warn("Amplify outputs file missing - diff trigger disabled");
}

const DIFF_API_NAME: string | null = (() => {
  const apiEntries = Object.entries(outputs?.custom?.API ?? {});
  if (outputs?.custom?.API?.diffApiv2) {
    return "diffApiv2";
  }
  if (apiEntries.length > 0) {
    const [firstName] = apiEntries[0];
    return firstName;
  }
  return null;
})();

interface ScoreEditorPocProps {
  workName: string;
  partName: string;
  onClose: () => void;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const createStrokeId = () => `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type PdfPageSize = {
  width: number;
  height: number;
};

type ContentRect = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const sanitized = base64.replace(/\s+/g, "");
  let binary: string;
  if (typeof globalThis.atob === "function") {
    binary = globalThis.atob(sanitized);
  } else if (typeof (globalThis as any).Buffer !== "undefined") {
    const bufferCtor = (globalThis as any).Buffer;
    return Uint8Array.from(bufferCtor.from(sanitized, "base64"));
  } else {
    throw new Error("Base64 decoder is not available in this environment");
  }

  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const ScoreEditorPoc: React.FC<ScoreEditorPocProps> = ({ workName, partName, onClose }) => {
  const [webSource, setWebSource] = useState<WebViewSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoneStack, setUndoneStack] = useState<Stroke[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(TOOL_COLORS[0]);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>("pen");
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const [latestKey, setLatestKey] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PdfPageSize | null>(null);
  const [renderSize, setRenderSize] = useState<PdfPageSize | null>(null);
  const pdfBase64Ref = useRef<string | null>(null);
  const [diffStatus, setDiffStatus] = useState<string | null>(null);
  const [diffRunning, setDiffRunning] = useState(false);

  const activeStrokeRef = useRef<Stroke | null>(null);
  const cachedPathRef = useRef<string | null>(null);
  const isLoadedRef = useRef(false);

  const contentRect = useMemo<ContentRect | null>(() => {
    if (!pageSize || !canvasSize.width || !canvasSize.height) {
      return null;
    }

    const canvasAspect = canvasSize.width / Math.max(canvasSize.height, 1);
    const pdfAspect = pageSize.width / pageSize.height;

    if (canvasAspect > pdfAspect) {
      const height = canvasSize.height;
      const width = height * pdfAspect;
      const offsetX = (canvasSize.width - width) / 2;
      return { offsetX, offsetY: 0, width, height };
    }

    const width = canvasSize.width;
    const height = width / pdfAspect;
    const offsetY = (canvasSize.height - height) / 2;
    return { offsetX: 0, offsetY, width, height };
  }, [canvasSize.height, canvasSize.width, pageSize]);

  const layerToNormalized = useCallback(
    (x: number, y: number): Point => {
      if (!contentRect) {
        return { x: 0, y: 0 };
      }

      return {
        x: clamp01(x / Math.max(contentRect.width, 1)),
        y: clamp01(y / Math.max(contentRect.height, 1)),
      };
    },
    [contentRect],
  );

  const normalizedToLayer = useCallback(
    (point: Point): { x: number; y: number } => {
      if (!contentRect) {
        return { x: 0, y: 0 };
      }

      return {
        x: point.x * contentRect.width,
        y: point.y * contentRect.height,
      };
    },
    [contentRect],
  );

  const buildViewerHtml = useCallback((base64: string) => {
    const sanitized = base64.replace(/\s+/g, "");
    const safe = sanitized.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; background: #f8fafc; }
      #viewer { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
      canvas { background: #ffffff; box-shadow: 0 0 6px rgba(0, 0, 0, 0.15); }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  </head>
  <body>
    <div id="viewer"><canvas id="pdfCanvas"></canvas></div>
    <script>
      const base64 = '${safe}';
      const pdfData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const render = async () => {
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const page = await pdf.getPage(1);
        const initialViewport = page.getViewport({ scale: 1 });
        const containerWidth = window.innerWidth;
        const scale = containerWidth / initialViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';

        await page.render({ canvasContext: context, viewport }).promise;

        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'viewport',
          width: canvas.width,
          height: canvas.height,
          pageWidth: initialViewport.width,
          pageHeight: initialViewport.height
        }));
      };

      render().catch((err) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'error', message: err?.message || String(err) }));
      });
    </script>
  </body>
</html>`;
  }, []);

  const loadLatestPdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWebSource(null);
    setLatestKey(null);
    setRenderSize(null);
    setPageSize(null);
    pdfBase64Ref.current = null;
    setDiffStatus(null);
    setDiffRunning(false);

    try {
      // Use 3-tier path
      const { items } = await list({ path: buildS3Path(workName, partName) });
      const candidates = (items ?? [])
        .filter((item: any) => {
          const key: string = item?.path ?? "";
          return key.endsWith(".pdf") && !key.includes("/diff/");
        })
        .sort((a: any, b: any) => {
          const aTime = a?.lastModified ? new Date(a.lastModified).getTime() : 0;
          const bTime = b?.lastModified ? new Date(b.lastModified).getTime() : 0;
          return bTime - aTime;
        });

      const latest = candidates[0];
      if (!latest) {
        setError(`No PDF found in ${workName}/${partName}`);
        setLoading(false);
        setPageSize(null);
        return;
      }

      const { url } = await getUrl({ path: latest.path });
      setLatestKey(latest.path);

      const localPath = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}editor-latest.pdf`;
      if (!localPath) {
        throw new Error("ローカルキャッシュディレクトリが見つかりません");
      }

      try {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      } catch (cleanupError) {
        console.warn("Failed to delete cached PDF", cleanupError);
      }

      const download = await FileSystem.downloadAsync(url.toString(), localPath);
      cachedPathRef.current = download.uri;

      const base64 = await FileSystem.readAsStringAsync(download.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      pdfBase64Ref.current = base64;

      try {
        const pdf = await PDFDocument.load(base64ToUint8Array(base64), { ignoreEncryption: true });
        const page = pdf.getPage(DEFAULT_PAGE_INDEX);
        setPageSize({ width: page.getWidth(), height: page.getHeight() });
      } catch (inspectError) {
        console.warn("Failed to inspect PDF dimensions", inspectError);
        setPageSize(null);
      }

      setWebSource({ html: buildViewerHtml(base64) });
    } catch (e) {
      console.error("Failed to fetch latest PDF", e);
      setError("PDFの取得に失敗しました");
      setPageSize(null);
      pdfBase64Ref.current = null;
    } finally {
      setLoading(false);
    }
  }, [buildViewerHtml, workName, partName]);

  useEffect(() => {
    // Updated storage key format to include part
    const storageKey = `${STORAGE_KEY_PREFIX}${workName}:${partName}`;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw) return;
        const parsed: Stroke[] = (JSON.parse(raw) as Stroke[]).map((stroke) => ({
          ...stroke,
          pageIndex: stroke.pageIndex ?? DEFAULT_PAGE_INDEX,
        }));
        setStrokes(parsed);
      })
      .catch((storageError) => {
        console.warn("Failed to load cached strokes", storageError);
      })
      .finally(() => {
        isLoadedRef.current = true;
      });
  }, [workName, partName]);

  useEffect(() => {
    if (!isLoadedRef.current) {
      return;
    }

    const storageKey = `${STORAGE_KEY_PREFIX}${workName}:${partName}`;
    const trimmed = strokes.slice(-MAX_UNDO);
    AsyncStorage.setItem(storageKey, JSON.stringify(trimmed)).catch((storageError) =>
      console.warn("Failed to persist strokes", storageError),
    );
  }, [workName, partName, strokes]);

  useEffect(() => {
    loadLatestPdf();
    return () => {
      const path = cachedPathRef.current;
      if (path) {
        FileSystem.deleteAsync(path, { idempotent: true }).catch((cleanupError) =>
          console.warn("Failed to cleanup cached PDF on unmount", cleanupError),
        );
      }
    };
  }, [loadLatestPdf]);

  const resetCanvas = useCallback(() => {
    Alert.alert("確認", "描画内容をクリアしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "クリア",
        style: "destructive",
        onPress: () => {
          setStrokes([]);
          setUndoneStack([]);
          const storageKey = `${STORAGE_KEY_PREFIX}${workName}:${partName}`;
          AsyncStorage.removeItem(storageKey).catch((storageError) =>
            console.warn("Failed to remove cached strokes", storageError),
          );
        },
      },
    ]);
  }, [workName, partName]);

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const next = prev.slice(0, -1);
      setUndoneStack((stack) => [prev[prev.length - 1], ...stack].slice(0, MAX_UNDO));
      return next;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setUndoneStack((stack) => {
      if (stack.length === 0) {
        return stack;
      }
      const [head, ...rest] = stack;
      setStrokes((prev) => [...prev, head].slice(-MAX_UNDO));
      return rest;
    });
  }, []);

  const toSvgPath = useCallback(
    (points: Point[]): string => {
      if (!contentRect || points.length === 0) {
        return "";
      }

      const [first, ...rest] = points;
      const firstLayer = normalizedToLayer(first);
      const moveTo = `M ${firstLayer.x} ${firstLayer.y}`;
      const lines = rest
        .map((point) => {
          const layerPoint = normalizedToLayer(point);
          return `L ${layerPoint.x} ${layerPoint.y}`;
        })
        .join(" ");

      return `${moveTo} ${lines}`;
    },
    [contentRect, normalizedToLayer],
  );

  const removeStrokesNearLayerPoint = useCallback(
    (layerX: number, layerY: number) => {
      if (!contentRect) {
        return;
      }

      const targetPoint = layerToNormalized(layerX, layerY);
      setStrokes((prev) => {
        let removed: Stroke[] = [];
        const remaining = prev.filter((stroke) => {
          if (stroke.pageIndex !== DEFAULT_PAGE_INDEX) {
            return true;
          }

          const hit = stroke.points.some((point) => {
            const dx = point.x - targetPoint.x;
            const dy = point.y - targetPoint.y;
            return dx * dx + dy * dy <= ERASER_RADIUS * ERASER_RADIUS;
          });

          if (hit) {
            removed.push(stroke);
            return false;
          }
          return true;
        });

        if (removed.length > 0) {
          setUndoneStack((stack) => [...removed, ...stack].slice(0, MAX_UNDO));
        }

        return remaining;
      });
    },
    [contentRect, layerToNormalized],
  );

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(contentRect),
        onMoveShouldSetPanResponder: () => Boolean(contentRect),
        onPanResponderGrant: (evt) => {
          if (!contentRect) {
            return;
          }

          const { locationX, locationY } = evt.nativeEvent;
          if (selectedTool === "pen") {
            const stroke: Stroke = {
              id: createStrokeId(),
              color: selectedColor,
              width: 3,
              points: [layerToNormalized(locationX, locationY)],
              pageIndex: DEFAULT_PAGE_INDEX,
            };

            activeStrokeRef.current = stroke;
            setStrokes((prev) => {
              const next = [...prev, stroke];
              return next.slice(-MAX_UNDO);
            });
            setUndoneStack([]);
          } else {
            activeStrokeRef.current = null;
            removeStrokesNearLayerPoint(locationX, locationY);
          }
        },
        onPanResponderMove: (evt) => {
          if (!contentRect) {
            return;
          }

          const { locationX, locationY } = evt.nativeEvent;

          if (selectedTool === "pen") {
            const stroke = activeStrokeRef.current;
            if (!stroke) {
              return;
            }

            const nextPoint = layerToNormalized(locationX, locationY);

            const points = [...stroke.points, nextPoint];
            const updatedStroke: Stroke = { ...stroke, points };
            activeStrokeRef.current = updatedStroke;

            setStrokes((prev) => prev.map((item) => (item.id === stroke.id ? updatedStroke : item)));
          } else {
            removeStrokesNearLayerPoint(locationX, locationY);
          }
        },
        onPanResponderRelease: () => {
          activeStrokeRef.current = null;
        },
        onPanResponderTerminate: () => {
          activeStrokeRef.current = null;
        },
      }),
    [contentRect, layerToNormalized, removeStrokesNearLayerPoint, selectedColor, selectedTool],
  );

  const hexToRgbColor = useCallback((hex: string) => {
    const normalized = hex.replace("#", "");
    const bigint = parseInt(normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return rgb(r / 255, g / 255, b / 255);
  }, []);

  const computeNewKey = useCallback((origin: string) => {
    const dotIndex = origin.lastIndexOf(".");
    const base = dotIndex >= 0 ? origin.slice(0, dotIndex) : origin;
    const ext = dotIndex >= 0 ? origin.slice(dotIndex) : ".pdf";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    return `${base}-annotated-${timestamp}${ext}`;
  }, []);

  const handleSave = useCallback(async () => {
    if (!cachedPathRef.current || !latestKey) {
      Alert.alert("保存できません", "ベースとなるPDFの取得がまだ完了していません。");
      return;
    }

    try {
      setSaving(true);

      const base64Pdf = await FileSystem.readAsStringAsync(cachedPathRef.current, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdf = await PDFDocument.load(base64ToUint8Array(base64Pdf), { ignoreEncryption: true });
      const pages = pdf.getPages();

      if (pages.length === 0) {
        throw new Error("PDF にページが含まれていません");
      }

      const page = pages[DEFAULT_PAGE_INDEX];
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const strokesForPage = strokes.filter(
        (stroke) => stroke.pageIndex === DEFAULT_PAGE_INDEX && stroke.points.length > 1,
      );

      strokesForPage.forEach((stroke) => {
        for (let i = 1; i < stroke.points.length; i += 1) {
          const prevPoint = stroke.points[i - 1];
          const currentPoint = stroke.points[i];

          page.drawLine({
            start: {
              x: prevPoint.x * pageWidth,
              y: pageHeight - prevPoint.y * pageHeight,
            },
            end: {
              x: currentPoint.x * pageWidth,
              y: pageHeight - currentPoint.y * pageHeight,
            },
            lineCap: LineCapStyle.Round,
            thickness: Math.max(0.5, stroke.width * 1.2),
            color: hexToRgbColor(stroke.color),
            opacity: 0.95,
          });
        }
      });

      const nextPdfBase64 = await pdf.saveAsBase64();
      const nextPdfBytes = base64ToUint8Array(nextPdfBase64);
      const newKey = computeNewKey(latestKey);

      await uploadData({
        path: newKey,
        data: nextPdfBytes,
        options: {
          contentType: "application/pdf",
        },
      }).result;

      setLatestKey(newKey);

      let diffMessage = "";
      if (DIFF_API_NAME) {
        try {
          setDiffRunning(true);
          const response = await post({
            apiName: DIFF_API_NAME,
            path: "diff",
            options: {
              body: {
                work: workName,
                part: partName,
                key: newKey,
              },
            },
          });
          const { body } = await response.response;
          const payload: any = await body.json();
          diffMessage = payload?.diff?.key
            ? `差分生成: ${payload.diff.key}`
            : payload?.message ?? "差分処理が完了しました";
          setDiffStatus(diffMessage);
        } catch (diffError: any) {
          console.error("Failed to trigger diff", diffError);
          diffMessage = diffError?.message ?? "差分処理に失敗しました";
          setDiffStatus(`差分失敗: ${diffMessage}`);
        } finally {
          setDiffRunning(false);
        }
      } else {
        diffMessage = "Diff API が設定されていません";
        setDiffStatus(diffMessage);
      }

      Alert.alert(
        "保存しました",
        `アノテーションを反映したPDFをアップロードしました。${diffMessage ? `\n${diffMessage}` : ""}`,
      );
    } catch (saveError: any) {
      console.error("Failed to save annotated PDF", saveError);
      Alert.alert("保存に失敗しました", saveError?.message ?? "不明なエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }, [base64ToUint8Array, computeNewKey, hexToRgbColor, latestKey, loadLatestPdf, strokes, workName, partName]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>閉じる</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{workName} / {partName} / Editor</Text>
        <TouchableOpacity onPress={resetCanvas} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>クリア</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={handleUndo}
          style={[styles.toolButton, strokes.length === 0 && styles.toolButtonDisabled]}
          disabled={strokes.length === 0}
        >
          <Text style={styles.toolButtonText}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleRedo}
          style={[styles.toolButton, undoneStack.length === 0 && styles.toolButtonDisabled]}
          disabled={undoneStack.length === 0}
        >
          <Text style={styles.toolButtonText}>Redo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.toolButton, (saving || diffRunning || !latestKey) && styles.toolButtonDisabled]}
          disabled={saving || diffRunning || !latestKey}
        >
          <Text style={styles.toolButtonText}>{saving ? "Saving..." : diffRunning ? "Diffing..." : "Save (PoC)"}</Text>
        </TouchableOpacity>
        <View style={styles.toolbarDivider} />
        <View style={styles.toolToggleGroup}>
          <TouchableOpacity
            onPress={() => setSelectedTool("pen")}
            style={[styles.toolToggleButton, selectedTool === "pen" && styles.toolToggleButtonActive]}
          >
            <Text
              style={[
                styles.toolToggleText,
                selectedTool === "pen" ? styles.toolToggleTextActive : styles.toolToggleTextInactive,
              ]}
            >
              Pen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedTool("eraser")}
            style={[styles.toolToggleButton, selectedTool === "eraser" && styles.toolToggleButtonActive]}
          >
            <Text
              style={[
                styles.toolToggleText,
                selectedTool === "eraser" ? styles.toolToggleTextActive : styles.toolToggleTextInactive,
              ]}
            >
              Eraser
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolbarDivider} />
        {TOOL_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[styles.colorChip, { backgroundColor: color, borderWidth: selectedColor === color ? 3 : 1 }]}
            onPress={() => setSelectedColor(color)}
          />
        ))}
      </View>

      {diffStatus && (
        <View style={styles.diffStatusContainer}>
          <Text style={styles.diffStatusText}>{diffStatus}</Text>
        </View>
      )}

      <View
        style={styles.canvasContainer}
        onLayout={(evt) => {
          setCanvasSize({
            width: evt.nativeEvent.layout.width,
            height: evt.nativeEvent.layout.height,
          });
        }}
      >
        {loading && (
          <View style={styles.overlayCenter}>
            <ActivityIndicator size="large" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.overlayCenter}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {webSource && !loading && (
          <View
            style={[
              styles.pdfViewport,
              contentRect
                ? {
                    width: contentRect.width,
                    height: contentRect.height,
                    left: contentRect.offsetX,
                    top: contentRect.offsetY,
                  }
                : styles.pdfViewportFull,
            ]}
          >
            <WebView
              source={webSource}
              style={StyleSheet.absoluteFill}
              originWhitelist={["*"]}
              javaScriptEnabled
              allowFileAccess
              androidLayerType="hardware"
            />
          </View>
        )}

        {contentRect && (
          <View
            style={[
              styles.drawingLayer,
              {
                width: contentRect.width,
                height: contentRect.height,
                left: contentRect.offsetX,
                top: contentRect.offsetY,
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Svg
              width={contentRect.width}
              height={contentRect.height}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {strokes.map((stroke) => (
                <Path
                  key={stroke.id}
                  d={toSvgPath(stroke.points)}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#d4d4d8",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#0f172a",
  },
  headerButtonText: {
    color: "#ffffff",
    fontSize: 13,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    flexWrap: "wrap",
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e2e8f0",
  },
  diffStatusContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  diffStatusText: {
    fontSize: 12,
    color: "#0f172a",
  },
  toolButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#0f172a",
  },
  toolButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  toolButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  toolToggleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0f172a",
    backgroundColor: "#ffffff",
  },
  toolToggleButtonActive: {
    backgroundColor: "#0f172a",
  },
  toolToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  toolToggleTextActive: {
    color: "#ffffff",
  },
  toolToggleTextInactive: {
    color: "#0f172a",
  },
  colorChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderColor: "#ffffff",
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    position: "relative",
  },
  pdfViewport: {
    position: "absolute",
    overflow: "hidden",
  },
  pdfViewportFull: {
    ...StyleSheet.absoluteFillObject,
  },
  drawingLayer: {
    position: "absolute",
  },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 16,
  },
  errorText: {
    color: "#dc2626",
    textAlign: "center",
  },
});

export default ScoreEditorPoc;
