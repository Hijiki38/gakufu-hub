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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";

import { uploadData, list, remove } from "aws-amplify/storage";

import { Amplify } from "aws-amplify";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";

// import outputs from "./amplify_outputs.json";

let outputs: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  outputs = require("./amplify_outputs.json");
} catch {
  console.warn("Amplify outputs file missing - backend features disabled");
}


Amplify.configure(outputs);

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
      const promises = items?.map((item: any) => remove({ path: item.path }).result) ?? [];
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

      if (existingCount > 0) {
        const endpoint = outputs?.custom?.API?.["sample-http-api"]?.endpoint;
        if (endpoint) {
          try {
            await fetch(`${endpoint}diff`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ repo: repoName, key: path }),
            });
          } catch (e) {
            console.error("Failed to trigger diff", e);
          }
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
      <Button title="Upload data" onPress={selectFile} />
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
  safeArea: {
    flex: 1,
  },
});

export default App;
