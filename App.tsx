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
  // const entries = Object.entries(apis) as Array<[string, any]>;
  // const endpoints = entries.flatMap(([keyName, cfg]) => {
  //   if (!cfg?.endpoint || !cfg?.region) return [];
  //   return [{
  //     name: keyName, // use the outputs key as canonical name (e.g., "diffApi")
  //     endpoint: String(cfg.endpoint).replace(/\/$/, ""),
  //     region: cfg.region,
  //   }];
  // });
  // // One-time startup log for configured REST endpoints
  // try {
  //   const summary = endpoints.map(e => `${e.name} -> ${e.endpoint} (${e.region})`);
  //   console.log("Amplify REST endpoints configured:", summary);
  // } catch {}

  Amplify.configure({
    ...amplifyConfig,
    API: {
      ...(amplifyConfig?.API || {}),
      REST: apis,
    },
  },
  {
    API: {
      REST: {
        retryStrategy: {
          strategy: 'no-retry', // Overrides default retry strategy
        },
      }
    }
  });
} catch (e) {
  console.warn("Failed to configure Amplify REST endpoints", e);
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
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [editorRepo, setEditorRepo] = useState<string | null>(null);

  const thumbnail = require("./assets/icon.png");

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const { items } = await list({ path: "data/" });
        const repoSet = new Set<string>();
        items?.forEach((item: any) => {
          const parts = item.path.split("/");
          if (parts.length > 1) {
            repoSet.add(parts[1]);
          }
        });
        setRepos(Array.from(repoSet));
      } catch (e) {
        console.error("Failed to list repositories", e);
      }
    };

    fetchRepos();
  }, []);

  const refreshRepos = async () => {
    try {
      const { items } = await list({ path: "data/" });
      const repoSet = new Set<string>();
      items?.forEach((item: any) => {
        const parts = item.path.split("/");
        if (parts.length > 1) {
          repoSet.add(parts[1]);
        }
      });
      setRepos(Array.from(repoSet));
    } catch (e) {
      console.error("Failed to refresh repositories", e);
    }
  };

  const deleteRepo = async (name: string) => {
    try {
      const { items } = await list({ path: `data/${name}/` });
      const promises = items?.map((item: any) => remove({ path: item.path })) ?? [];
      await Promise.all(promises);
      if (selectedRepo === name) {
        setSelectedRepo(null);
        setNewRepoName("");
      }
      await refreshRepos();
    } catch (e) {
      console.error("Failed to delete repository", e);
    }
  };

  const confirmDeleteRepo = (name: string) => {
    Alert.alert("Delete Repository", `${name} を削除しますか？`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteRepo(name),
      },
    ]);
  };

  const selectFile = async () => {
    const repoName =
      selectedRepo === "__new__" ? newRepoName.trim() : selectedRepo;

    if (!repoName) {
      return;
    }

    let existingCount = 0;
    try {
      const { items } = await list({ path: `data/${repoName}/` });
      existingCount = items?.length ?? 0;
    } catch (e) {
      console.error("Failed to check repository files", e);
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
      const path = `data/${repoName}/${Date.now()}-${picked.name}`;

      console.log("Uploading to", path);


      await uploadData({ path, data: blob }).result;
      console.log("Uploaded", path);
      console.log("existingCount", existingCount);

      // // debug: call the test function
      // try {
      //   const testApiConfig = outputs?.custom?.API?.["testApi"];
      //   if (!testApiConfig?.endpoint) {
      //     console.warn("Test API endpoint not configured");
      //     return;
      //   }
      //   console.log("Calling test function");
      //   const res = get({
      //     apiName: "testApi",
      //     path: "/hello-amplify",
      //     options: {
      //       headers: {
      //         "Content-Type": "application/json",
      //       },
      //       // authMode: 'AWS_IAM',
      //     },
      //   });
      //   const {body} = await res.response;
      //   const data = await body.json();
      //   console.log("Test function response:", data);
      // } catch (e) {
      //   console.error("Failed to call test function", e);
      // }

      if (existingCount > 0) {
        const apiConfig = outputs?.custom?.API?.["diffApiv2"];
        if (apiConfig?.endpoint) {
          try {
            // console.log("apiName", "diffApi");
            console.log("endpoint", apiConfig.endpoint);
            const API_URL = "https://r8gpf1ly2a.execute-api.ap-northeast-1.amazonaws.com" //apiConfig.endpoint.replace(/\/$/, "");
            // const restmp = await fetch(`${API_URL}/diff`, { method: 'GET' });
            // const restmp = await get({
            //   apiName: "diffApiv2", // must match API.REST.endpoints[].name
            //   path: "/diff",
            //   options: {
            //     headers: {
            //       "Content-Type": "application/json",
            //     },
            //   },
            // });
            // console.log(await 'raw response', restmp);
            // const {body: rb} = await restmp.response;
            // const text = await rb.text();
            // const text = await restmp.text(); // ← まずは生テキスト
            // console.log('status', restmp.status, 'headers', Object.fromEntries(restmp.headers), 'body', text);
            // if (!restmp.ok) throw new Error(`HTTP ${restmp.status}: ${text}`);
            
            const res = await post({
              apiName: "diffApiv2", // must match API.REST.endpoints[].name
              path: "diff", //"/diff",
              options: {
                body: { repo: repoName, key: path },
                // headers: {
                //   "Content-Type": "application/json",
                // },
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

      setSelectedRepo(null);
      setNewRepoName("");

      await refreshRepos();
    } catch (e) {
      console.error("Upload failed", e);
    }
  };

  return (
    <View>
      <Text style={styles.modalTitle}>Repositories</Text>
      <FlatList
        data={["__new__", ...repos]}
        numColumns={3}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.repoList}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.repoTile, selectedRepo === item && styles.repoSelected]}
            onPress={() => setSelectedRepo(item)}
            onLongPress={item !== "__new__" ? () => confirmDeleteRepo(item) : undefined}
          >
            <Image source={thumbnail} style={styles.repoThumbnail} />
            <Text style={styles.repoName}>
              {item === "__new__" ? "新しいレポジトリ" : item}
            </Text>
          </Pressable>
        )}
      />
      {selectedRepo === "__new__" && (
        <TextInput
          placeholder="Repository name"
          value={newRepoName}
          onChangeText={setNewRepoName}
          style={styles.repoInput}
        />
      )}
      <View style={styles.buttonGroup}>
        <Button title="Upload data" onPress={selectFile} />
        <View style={styles.buttonSpacer} />
        <Button
          title="Open Editor (PoC)"
          onPress={() => {
            if (selectedRepo && selectedRepo !== "__new__") {
              setEditorRepo(selectedRepo);
            }
          }}
          disabled={!selectedRepo || selectedRepo === "__new__"}
        />
      </View>

      <Modal
        visible={Boolean(editorRepo)}
        animationType="slide"
        onRequestClose={() => setEditorRepo(null)}
        presentationStyle="fullScreen"
      >
        {editorRepo && (
          <ScoreEditorPoc repoName={editorRepo} onClose={() => setEditorRepo(null)} />
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
