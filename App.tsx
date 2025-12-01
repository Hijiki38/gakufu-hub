import React, { useState, useEffect } from "react";
import {
  Alert,
  Button,
  View,
  StyleSheet,
  TextInput,
  Text,
  Pressable,
  FlatList,
  Image,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";

import { uploadData, list, remove } from "aws-amplify/storage";

import { Amplify } from "aws-amplify";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";

import { get, post } from "aws-amplify/api";
import { parseAmplifyConfig } from "aws-amplify/utils";
import ScoreEditorPoc from "./src/editor/ScoreEditorPoc";
import {
  Work,
  PartInfo,
  PartType,
  VALID_PARTS,
  PART_LABELS,
  parseS3Path,
  buildS3Path,
  isValidPart,
} from "./types";


// import outputs from "./amplify_outputs.json";



let outputs: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  outputs = require("./amplify_outputs.json");
} catch {
  console.warn("Amplify outputs file missing - backend features disabled");
}

// Register REST endpoints from outputs.custom.API properly for Amplify API (v6)
try {
  const amplifyConfig = parseAmplifyConfig(outputs);
  const apis = outputs?.custom?.API ?? {};

  // Clean API configurations: remove redundant apiName field
  const cleanedApis = Object.fromEntries(
    Object.entries(apis).map(([name, config]: [string, any]) => [
      name,
      {
        endpoint: config.endpoint,
        region: config.region,
      },
    ])
  );

  // Merge REST API config into amplifyConfig BEFORE calling configure
  const finalConfig = {
    ...amplifyConfig,
    API: {
      ...(amplifyConfig?.API || {}),
      REST: cleanedApis,
    },
  };

  // Configure Amplify once with all settings
  Amplify.configure(finalConfig);

  // Log configured REST endpoints
  console.log("=== Amplify Configuration ===");
  console.log("REST API keys:", Object.keys(cleanedApis));
  console.log("REST APIs:", JSON.stringify(cleanedApis, null, 2));
} catch (e) {
  console.warn("Failed to configure Amplify", e);
}

// Canonical REST API name to use for calls (fall back to 'diffApi')
// const REST_API_NAME: string = Object.keys(outputs?.custom?.API ?? {})[0] || "diffApi";

const SignOutButton = () => {
  const { signOut } = useAuthenticator();

  return (
    <View style={styles.signOutButton}>
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
};


const UploadSection = () => {
  // Navigation state
  type NavigationLevel = 'work' | 'part';
  const [currentLevel, setCurrentLevel] = useState<NavigationLevel>('work');

  // Work-level state
  const [works, setWorks] = useState<Work[]>([]);
  const [selectedWork, setSelectedWork] = useState<string | null>(null);
  const [newWorkName, setNewWorkName] = useState("");

  // Part-level state
  const [availableParts, setAvailableParts] = useState<PartInfo[]>([]);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  // Editor state
  const [editorWork, setEditorWork] = useState<string | null>(null);
  const [editorPart, setEditorPart] = useState<string | null>(null);

  const thumbnail = require("./assets/icon.png");

  // Fetch all works and their parts
  const fetchWorks = async () => {
    try {
      const { items } = await list({ path: "data/" });
      const workMap = new Map<string, Set<string>>();

      items?.forEach((item: any) => {
        try {
          const parsed = parseS3Path(item.path);

          // Skip diff files
          if (parsed.isDiff) return;

          // Only process items with both work and part
          if (parsed.work && parsed.part) {
            if (!workMap.has(parsed.work)) {
              workMap.set(parsed.work, new Set());
            }
            workMap.get(parsed.work)!.add(parsed.part);
          }
        } catch (e) {
          // Skip items that can't be parsed (e.g., legacy format or invalid paths)
          console.warn('Failed to parse path:', item.path, e);
        }
      });

      const worksList: Work[] = Array.from(workMap.entries()).map(([name, partsSet]) => ({
        name,
        parts: Array.from(partsSet).sort(),
      }));

      setWorks(worksList);
    } catch (e) {
      console.error("Failed to list works", e);
    }
  };

  // Fetch parts for a specific work
  const fetchPartsForWork = async (workName: string) => {
    try {
      const { items } = await list({ path: `data/${workName}/` });
      const partMap = new Map<string, { count: number; latest?: Date }>();

      items?.forEach((item: any) => {
        try {
          const parsed = parseS3Path(item.path);

          // Skip diff files
          if (parsed.isDiff || !parsed.part || !parsed.filename) return;

          const existing = partMap.get(parsed.part) || { count: 0 };
          const modified = item.lastModified ? new Date(item.lastModified) : undefined;

          partMap.set(parsed.part, {
            count: existing.count + 1,
            latest: modified && (!existing.latest || modified > existing.latest)
              ? modified
              : existing.latest,
          });
        } catch (e) {
          console.warn('Failed to parse path:', item.path, e);
        }
      });

      const partsList: PartInfo[] = Array.from(partMap.entries()).map(([part, info]) => ({
        part,
        fileCount: info.count,
        latestModified: info.latest,
      }));

      // Sort by part order (vn1, vn2, va, vc, cb)
      partsList.sort((a, b) => {
        const indexA = VALID_PARTS.indexOf(a.part as PartType);
        const indexB = VALID_PARTS.indexOf(b.part as PartType);
        return indexA - indexB;
      });

      setAvailableParts(partsList);
    } catch (e) {
      console.error("Failed to fetch parts", e);
    }
  };

  useEffect(() => {
    fetchWorks();
  }, []);

  // Delete a work (all parts)
  const deleteWork = async (name: string) => {
    try {
      const { items } = await list({ path: `data/${name}/` });
      const promises = items?.map((item: any) => remove({ path: item.path })) ?? [];
      await Promise.all(promises);

      if (selectedWork === name) {
        setSelectedWork(null);
        setSelectedPart(null);
        setNewWorkName("");
        setCurrentLevel('work');
      }

      await fetchWorks();
    } catch (e) {
      console.error("Failed to delete work", e);
    }
  };

  const confirmDeleteWork = (name: string) => {
    Alert.alert("Delete Work", `Delete "${name}" and all its parts?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteWork(name),
      },
    ]);
  };

  // Upload PDF file
  const selectFile = async () => {
    const workName = selectedWork === "__new__" ? newWorkName.trim() : selectedWork;
    const partName = selectedPart;

    if (!workName || !partName) {
      Alert.alert("Error", "Please select both work and part");
      return;
    }

    // Validate part
    if (!isValidPart(partName)) {
      Alert.alert("Error", `Invalid part: ${partName}`);
      return;
    }

    let existingCount = 0;
    try {
      const { items } = await list({ path: `data/${workName}/${partName}/` });
      existingCount = items?.filter((item: any) =>
        !item.path.includes('/diff/')
      ).length ?? 0;
    } catch (e) {
      console.error("Failed to check existing files", e);
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const picked = result.assets?.[0];
      if (!picked) {
        return;
      }

      const response = await fetch(picked.uri);
      const blob = await response.blob();

      // Build 3-tier path
      const path = buildS3Path(workName, partName, `${Date.now()}-${picked.name}`);

      console.log("Uploading to", path);

      await uploadData({ path, data: blob }).result;
      console.log("Uploaded", path);

      // Trigger diff if existing files
      if (existingCount > 0) {
        // Check if diffApiv2 API exists in outputs
        const hasApiConfig = outputs?.custom?.API?.["diffApiv2"];
        console.log("=== Diff API Call Debug ===");
        console.log("Has API config:", !!hasApiConfig);
        console.log("Calling post with apiName: diffApiv2");

        if (hasApiConfig) {
          try {
            const res = await post({
              apiName: "diffApiv2",
              path: "diff",
              options: {
                body: {
                  work: workName,
                  part: partName,
                  key: path
                },
              },
            });
            const {body} = await res.response;
            const data = await body.json();
            console.log("Diff API response:", data);
          } catch (e) {
            console.error("Failed to trigger diff", e);
          }
        } else {
          console.warn("Diff API endpoint not configured");
        }
      }

      // Reset selection
      setSelectedWork(null);
      setSelectedPart(null);
      setNewWorkName("");
      setCurrentLevel('work');

      await fetchWorks();
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  // Render work selection screen
  const renderWorkSelection = () => (
    <>
      <Text style={styles.modalTitle}>Works</Text>
      <FlatList
        data={["__new__", ...works.map(w => w.name)]}
        numColumns={3}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.repoList}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.repoTile, selectedWork === item && styles.repoSelected]}
            onPress={() => {
              setSelectedWork(item);
              if (item !== "__new__") {
                setCurrentLevel('part');
                fetchPartsForWork(item);
              }
            }}
            onLongPress={item !== "__new__" ? () => confirmDeleteWork(item) : undefined}
          >
            <Image source={thumbnail} style={styles.repoThumbnail} />
            <Text style={styles.repoName}>
              {item === "__new__" ? "New Work" : item}
            </Text>
          </Pressable>
        )}
      />
      {selectedWork === "__new__" && (
        <>
          <TextInput
            placeholder="Work name (e.g., beethoven-symphony-5)"
            value={newWorkName}
            onChangeText={setNewWorkName}
            style={styles.repoInput}
          />
          <Button
            title="Create Work & Select Part"
            onPress={() => {
              if (newWorkName.trim()) {
                setCurrentLevel('part');
                setAvailableParts([]); // New work has no existing parts
              } else {
                Alert.alert("Error", "Please enter a work name");
              }
            }}
            disabled={!newWorkName.trim()}
          />
        </>
      )}
    </>
  );

  // Render part selection screen
  const renderPartSelection = () => (
    <>
      <View style={styles.header}>
        <Button
          title="← Back to Works"
          onPress={() => {
            setCurrentLevel('work');
            setSelectedPart(null);
          }}
        />
        <Text style={styles.headerText}>{selectedWork}</Text>
      </View>

      <Text style={styles.modalTitle}>Select Part</Text>

      {/* All available parts for selection */}
      <View style={styles.partContainer}>
        {VALID_PARTS.map((item) => {
          const partInfo = availableParts.find(p => p.part === item);
          return (
            <Pressable
              key={item}
              style={[
                styles.partTile,
                selectedPart === item && styles.partSelected
              ]}
              onPress={() => setSelectedPart(item)}
            >
              <Text style={styles.partName}>{PART_LABELS[item]}</Text>
              <Text style={styles.partCode}>({item})</Text>
              {partInfo && (
                <>
                  <Text style={styles.partInfo}>{partInfo.fileCount} files</Text>
                  {partInfo.latestModified && (
                    <Text style={styles.partDate}>
                      {partInfo.latestModified.toLocaleDateString()}
                    </Text>
                  )}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View>
      {currentLevel === 'work' && renderWorkSelection()}
      {currentLevel === 'part' && renderPartSelection()}

      {/* Only show buttons on part selection screen */}
      {currentLevel === 'part' && (
        <View style={styles.buttonGroup}>
          <Button
            title="Upload PDF"
            onPress={selectFile}
            disabled={!selectedWork || !selectedPart}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="Open Editor (PoC)"
            onPress={() => {
              if (selectedWork && selectedWork !== "__new__" && selectedPart) {
                setEditorWork(selectedWork);
                setEditorPart(selectedPart);
              }
            }}
            disabled={!selectedWork || selectedWork === "__new__" || !selectedPart}
          />
        </View>
      )}

      <Modal
        visible={Boolean(editorWork && editorPart)}
        animationType="slide"
        onRequestClose={() => {
          setEditorWork(null);
          setEditorPart(null);
        }}
        presentationStyle="fullScreen"
      >
        {editorWork && editorPart && (
          <ScoreEditorPoc
            workName={editorWork}
            partName={editorPart}
            onClose={() => {
              setEditorWork(null);
              setEditorPart(null);
            }}
          />
        )}
      </Modal>
    </View>
  );
};


const App = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Authenticator.Provider>
        <Authenticator>
          <SignOutButton />
          <UploadSection />
        </Authenticator>
      </Authenticator.Provider>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  signOutButton: {
    alignSelf: "flex-end",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  repoList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  repoTile: {
    width: 100,
    margin: 4,
    padding: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  repoThumbnail: {
    width: 64,
    height: 64,
    marginBottom: 4,
    resizeMode: "contain",
  },
  repoName: {
    textAlign: "center",
  },
  repoSelected: {
    borderColor: "#3366ff",
    borderWidth: 2,
  },
  repoInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    padding: 4,
    marginBottom: 8,
  },
  partContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  partTile: {
    width: "47%", // 2 columns with spacing
    margin: "1.5%",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#f9f9f9",
    minHeight: 120,
  },
  partSelected: {
    borderColor: "#3366ff",
    borderWidth: 2,
    backgroundColor: "#e6f0ff",
  },
  partName: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  partCode: {
    fontSize: 12,
    color: "#666",
  },
  partInfo: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  partDate: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  buttonSpacer: {
    width: 12,
  },
  safeArea: {
    flex: 1,
  },
});

export default App;
