import React, { useState, useEffect } from "react";
import {
  Button,
  View,
  StyleSheet,
  TextInput,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { uploadData, list } from "aws-amplify/storage";

import { Amplify } from "aws-amplify";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";

// import outputs from "./amplify_outputs.json";
import { parseAmplifyConfig } from "aws-amplify/utils";

import { get, post } from "aws-amplify/api";

let outputs: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  outputs = require("./amplify_outputs.json");
} catch {
  console.warn("Amplify outputs file missing - backend features disabled");
}

// const amplifyConfig = parseAmplifyConfig(outputs);

// const restApiConfig = outputs?.custom?.API;
// const apiNameFromConfig = restApiConfig
//   ? Object.keys(restApiConfig)[0]
//   : undefined;

// Amplify.configure(
//   {
//     ...amplifyConfig,
//     ...(restApiConfig && {
//       API: {
//         ...amplifyConfig.API,
//         REST: restApiConfig,
//       },
//     }),
//   },
//   {
//     API: {
//       REST: {
//         retryStrategy: {
//           strategy: 'no-retry', // Overrides default retry strategy
//         },
//       },
//     },
//   }
// );

Amplify.configure(outputs);

const SignOutButton = () => {
  const { signOut } = useAuthenticator();

  return (
    <View style={styles.signOutButton}>
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
};

// const ApiTestButton = () => {
//   const { user } = useAuthenticator();

//   const handleGetData = async () => {
//     try {
//       const data = await getDataFromFrontend();
//       console.log("GET Data:", data);
//     } catch (error) {
//       console.error("Error fetching data:", error);
//     }
//   };

//   const handlePostData = async () => {
//     try {
//       const body = { message: "Hello from React Native!" };
//       const data = await postDataFromFrontend(body);
//       console.log("POST Data:", data);
//     } catch (error) {
//       console.error("Error posting data:", error);
//     }
//   };

//   return (
//     <View>
//       <Button title="Get Data" onPress={handleGetData} />
//       <Button title="Post Data" onPress={handlePostData} />
//     </View>
//   );
// }

// const getDataFromFrontend = () => {
//   if (!apiNameFromConfig) {
//     throw new Error('REST API is not configured');
//   }
//   const httpOperation = get({
//     apiName: apiNameFromConfig,
//     path: '/items',
//   });
//   return httpOperation.response.then((resp) => resp.body.json());
// };

const UploadSection = () => {
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");

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

  const selectFile = async () => {
    const repoName =
      selectedRepo === "__new__" ? newRepoName.trim() : selectedRepo;

    if (!repoName) {
      return;
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
      <ScrollView style={styles.repoList}>
        <Pressable onPress={() => setSelectedRepo("__new__")}>
          <Text
            style={[
              styles.repoItem,
              selectedRepo === "__new__" && styles.repoSelected,
            ]}
          >
            新しいレポジトリ
          </Text>
        </Pressable>
        {repos.map((r) => (
          <Pressable key={r} onPress={() => setSelectedRepo(r)}>
            <Text
              style={[styles.repoItem, selectedRepo === r && styles.repoSelected]}
            >
              {r}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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

// const postDataFromFrontend = (body) => {
//   if (!apiNameFromConfig) {
//     throw new Error('REST API is not configured');
//   }
//   const httpOperation = post({
//     apiName: apiNameFromConfig,
//     path: '/items',
//     options: {
//       body,
//     }
//   });
//   return httpOperation.response.then((resp) => resp.body.json());
// };

const App = () => {
  return (
    <Authenticator.Provider>
      <Authenticator>
        <SignOutButton />
        {/* <ApiTestButton /> */}
        <UploadSection />
        {/* You can add more components here to test your API */}
      </Authenticator>
    </Authenticator.Provider>
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
    maxHeight: 150,
    marginBottom: 8,
  },
  repoItem: {
    padding: 4,
  },
  repoSelected: {
    backgroundColor: "#ddeeff",
  },
  repoInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    padding: 4,
    marginBottom: 8,
  },
});

export default App;
