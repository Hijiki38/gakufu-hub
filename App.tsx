import React, { useState } from "react";
import {
  Button,
  View,
  StyleSheet,
  Modal,
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

const amplifyConfig = parseAmplifyConfig(outputs);

const restApiConfig = outputs?.custom?.API;
const apiNameFromConfig = restApiConfig
  ? Object.keys(restApiConfig)[0]
  : undefined;

Amplify.configure(
  {
    ...amplifyConfig,
    ...(restApiConfig && {
      API: {
        ...amplifyConfig.API,
        REST: restApiConfig,
      },
    }),
  },
  {
    API: {
      REST: {
        retryStrategy: {
          strategy: 'no-retry', // Overrides default retry strategy
        },
      },
    },
  }
);

const SignOutButton = () => {
  const { signOut } = useAuthenticator();

  return (
    <View style={styles.signOutButton}>
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
};

const ApiTestButton = () => {
  const { user } = useAuthenticator();

  const handleGetData = async () => {
    try {
      const data = await getDataFromFrontend();
      console.log("GET Data:", data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handlePostData = async () => {
    try {
      const body = { message: "Hello from React Native!" };
      const data = await postDataFromFrontend(body);
      console.log("POST Data:", data);
    } catch (error) {
      console.error("Error posting data:", error);
    }
  };

  return (
    <View>
      <Button title="Get Data" onPress={handleGetData} />
      <Button title="Post Data" onPress={handlePostData} />
    </View>
  );
}

const getDataFromFrontend = () => {
  if (!apiNameFromConfig) {
    throw new Error('REST API is not configured');
  }
  const httpOperation = get({
    apiName: apiNameFromConfig,
    path: '/items',
  });
  return httpOperation.response.then((resp) => resp.body.json());
};

const UploadButton = () => {
  const [asset, setAsset] = useState<any>(null);
  const [repo, setRepo] = useState("");
  const [repos, setRepos] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const selectFile = async () => {
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

      setAsset(picked);

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

      setModalVisible(true);
    } catch (e) {
      console.error("Document pick failed", e);
    }
  };

  const upload = async () => {
    if (!asset || !repo) {
      return;
    }

    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const path = `data/${repo}/${Date.now()}-${asset.name}`;

      await uploadData({ path, data: blob }).result;
      console.log("Uploaded", path);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setModalVisible(false);
      setRepo("");
      setAsset(null);
    }
  };

  return (
    <View>
      <Button title="Upload data" onPress={selectFile} />
      <Modal transparent visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select or create repository</Text>
            <ScrollView style={styles.repoList}>
              {repos.map((r) => (
                <Pressable key={r} onPress={() => setRepo(r)}>
                  <Text style={[styles.repoItem, repo === r && styles.repoSelected]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              placeholder="Repository path"
              value={repo}
              onChangeText={setRepo}
              style={styles.repoInput}
            />
            <Button title="Upload" onPress={upload} />
            <Button title="Cancel" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const postDataFromFrontend = (body) => {
  if (!apiNameFromConfig) {
    throw new Error('REST API is not configured');
  }
  const httpOperation = post({
    apiName: apiNameFromConfig,
    path: '/items',
    options: {
      body,
    }
  });
  return httpOperation.response.then((resp) => resp.body.json());
};

const App = () => {
  return (
    <Authenticator.Provider>
      <Authenticator>
        <SignOutButton />
        <ApiTestButton />
        <UploadButton />
        {/* You can add more components here to test your API */}
      </Authenticator>
    </Authenticator.Provider>
  );
};

const styles = StyleSheet.create({
  signOutButton: {
    alignSelf: "flex-end",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 8,
    width: "80%",
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
