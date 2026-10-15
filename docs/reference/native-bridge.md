# JavaScript bridge 索引

0.8.6 MainActivity.javaから静的抽出。戻り値・非同期通知・例外・スレッド条件は実装を読む。

```java
void castAudio(String spec);
void stopCast();
void libraryReady();
void checkSavedBooks(String json);
void runSelfTest(String files, String token);
void cancelSelfTest();
void copyText(String text);
void shareText(String text);
void exportText(String text,String name);
void openAudioInVlc(String localName, String displayName);
void shareNamedBook(String localName,String displayName,String mime);
void chooseBooks();
void chooseReadingData();
void exportReadingData(String json);
void keepAwake(boolean keep);
String getNetworkStatus();
void openTailscale();
boolean isTelevision();
void publishAudioLibrary(String json);
String getAudioPositions();
void pinReadingWidget(boolean rich);
void openCastSettings();
void setModalOpen(boolean open);
void speakText(String text, float rate, String title, String token);
void stopSpeech();
void updateWidgetBooks(String json);
void shareBook(String localName, String mime);
void exportBook(String localName, String suggestedName, String mime);
void downloadBook(String base, String apiPath, String version,
                String sid, String remotePath, String title, String mime, String bookId, long expectedSize);
void controlDownload(String action);
String getDownloadState();
boolean openBook(String localName, String mime);
boolean hasBook(String name);
boolean deleteBook(String name);
String getStorageInfo();
String setDownloadStorage(String id);
void requestBookThumbnail(String localName);
String remoteThumbnailPath(String bookPath, String rootsJson);
void requestRemoteBookThumbnail(String base, String apiPath,
                String version, String sid, String remotePath, String cacheKey);
void renderPdfPage(String localName, int pageIndex, String token);
String readText(String localName);
String getAppVersion();
void saveCredentials(String base, String account, String password, String sid);
String loadCredentials();
void clearCredentials();
String getEpubChapter(String localName, int chapter);
void renderComicPage(String localName,int requested,String token);
void closeComic();
String getAudioChapters(String localName);
void playAudio(String localName, String token, int positionMs, float speed, String title, String subtitle);
String playNasAudio(String spec);
void audioAction(String action, int value);
String getPlaybackState();
void playbackAction(String action, long value, float speed);
```
