// PdfUpdateScreen.tsx
import React, { useState } from 'react';
import { View, Button, Text, StyleSheet, Alert } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { uploadData } from 'aws-amplify/storage';
import { post } from 'aws-amplify/api';
import { fetchAuthSession } from '@aws-amplify/auth';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';



import type { RootStackParamList } from './src/navigation/types';

export default function PdfUpdateScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Update'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { key: oldKey, url: oldUrl } = route.params;
  const [loading, setLoading] = useState<boolean>(false);
  const [newPdf, setNewPdf] = useState<{ uri: string; name: string } | null>(null);

  const pickNewPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled) {
      const { uri, name } = res.assets[0];
      setNewPdf({ uri, name });
    }
  };

  const onProceed = async () => {
    if (!newPdf) {
      return Alert.alert('エラー', '新しいPDFを選択してください');
    }
    // ここで oldKey, newPdf.uri, newPdf.name を使ってアップロード／API呼び出し
    console.log('旧PDFキー:', oldKey);
    console.log('新PDF URI:', newPdf.uri, 'ファイル名:', newPdf.name);
    // Storage.put／uploadData→ API Gateway 呼び出し…
    setLoading(true);
    try{
      const {uri, name} = newPdf;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = Buffer.from(base64, 'base64');

      // S3 へのアップロード処理
      const newKey = `data/uploads/${name}`;
      const uploadResult = await uploadData({
        path: newKey,
        data: buffer,
        options: {
          contentType: 'application/pdf',
          onProgress: (progress) => {
            console.log('Uploading new PDF:', progress);
          }
        },
      });
      console.log('Upload succeeded:', uploadResult.result);

      const session = await fetchAuthSession();
      console.log('Auth session:', session);
      const authToken = session?.tokens?.idToken?.toString() || '';
      
      // ここで差分処理のAPIを呼び出す
      // 差分抽出APIに旧PDFと新PDFのキーを送信
      const apiname = 'sample-http-api';
      try {
        const restResponse = await post({
          apiName: apiname,
          path: '/diff',
          options: {
            body: {
              oldKey,
              newKey,
            },
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authToken
            },
            // authMode: 'AWS_IAM', // IAM認証を使用
          },
        });

        const { body } = await restResponse.response;
        const apiResult = await body.json();
        console.log('差分処理APIのレスポンス:', apiResult);
      } catch (error) {
        console.error('Error posting data:', error);
      }
      
    } catch (error) {
      console.error('Error during PDF update:', error);
      Alert.alert('エラー', '新しいPDFの差分処理に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>旧PDF：</Text>
      <Text numberOfLines={1} style={styles.filename}>{oldKey.split('/').pop()}</Text>
      <Button title="新しいPDFを選択" onPress={pickNewPdf} />
      {newPdf && (
        <Text style={styles.selected}>選択済: {newPdf.name}</Text>
      )}
      <View style={styles.proceed}>
        <Button title="差分処理へ進む" onPress={onProceed} disabled={!newPdf} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontWeight: 'bold', marginBottom: 8 },
  filename: { marginBottom: 16 },
  selected: { marginTop: 8, fontStyle: 'italic' },
  proceed: { marginTop: 24 },
});
