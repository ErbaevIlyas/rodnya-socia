import React from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  // Замени на свой URL после деплоя
  const webUrl = 'https://your-rodnya-app.railway.app';
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4facfe" />
      <WebView
        source={{ uri: webUrl }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        onError={(error) => console.log('WebView error: ', error)}
        onHttpError={(error) => console.log('HTTP error: ', error)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4facfe',
  },
  webview: {
    flex: 1,
  },
});