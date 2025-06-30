import React from "react";
import { Text, Button, View, StyleSheet, SafeAreaView } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from "react-native-safe-area-context";

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
  const Stack = createStackNavigator();
  return (
    <Authenticator.Provider>
      <Authenticator>
        {/* <SignOutButton />
        <ApiTestButton />
        You can add more components here to test your API */}
        <View style={styles.container}>
          <Text style={{ fontSize: 20 }}>Amplify + Expo + React Native</Text>
          <Button title="画像を選んでアップロード" onPress={uploadImage} />

          <NavigationContainer>
            <Stack.Navigator>
              <Stack.Screen name="FileList" component={FileList} /> 
              <Stack.Screen name="Update" component={PdfUpdateScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </Authenticator>
    </Authenticator.Provider>
  );
};


const styles = StyleSheet.create({
  signOutButton: {
    alignSelf: "flex-end",
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    // alignItems: 'center',
    //alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    paddingTop: 10,
  },
  listContainer: {
    flex: 1,
    marginTop: 20,
  },
});


export default App;