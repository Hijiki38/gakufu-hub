import React from "react";
import { Button, View, StyleSheet } from "react-native";

import { Amplify } from "aws-amplify";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";

import outputs from "./amplify_outputs.json";
import { parseAmplifyConfig } from "aws-amplify/utils";

import { get, post } from "aws-amplify/api";

const amplifyConfig = parseAmplifyConfig(outputs);

Amplify.configure(
  {
    ...amplifyConfig,
    API: {
      ...amplifyConfig.API,
      REST: outputs.custom.API,
    },
  },
  {
    API: {
      REST: {
        retryStrategy: {
          strategy: 'no-retry' // Overrides default retry strategy
        },
      }
    }
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
  const httpOperation = get({
    apiName: 'sample-http-api',
    path: '/',
  });
  return httpOperation.response.then((resp) => resp.body.json());
};

const postDataFromFrontend = (body) => {

  const httpOperation = post({
    apiName: 'sample-api',
    path: '/',
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