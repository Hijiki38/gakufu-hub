import React from "react";
import { Button, View, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { uploadData } from "aws-amplify/storage";

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
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return;
      }

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const path = `data/${Date.now()}-${asset.name}`;

      await uploadData({ path, data: blob }).result;
      console.log('Uploaded', path);
    } catch (error) {
      console.error('Upload failed', error);
    }
  };

  return <Button title="Upload data" onPress={handleUpload} />;
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
});

export default App;
