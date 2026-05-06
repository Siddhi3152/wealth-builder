import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export default function AiChatScreen() {
  const router = useRouter();
  const flatListRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: '1', text: "Hello! I'm your AI financial assistant. Ask me anything about your expenses, budgeting, or investments. 💡", sender: 'ai' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    const newMsgs = [...messages, { id: String(Date.now()), text: userMsg, sender: 'user' }];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/chat', { message: userMsg });
      setMessages(prev => [...prev, { id: String(Date.now() + 1), text: res.data.reply, sender: 'ai' }]);
    } catch {
      setMessages(prev => [...prev, { id: String(Date.now() + 1), text: "Sorry, I'm having trouble connecting. Is the backend running?", sender: 'ai' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Ionicons name="sparkles" size={20} color="#FFF" style={{ marginRight: 8 }} />
        <Text style={styles.headerTitle}>AI Financial Assistant</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.msgRow, item.sender === 'user' ? styles.msgRowUser : styles.msgRowAi]}>
            <View style={[styles.msgBubble, item.sender === 'user' ? styles.msgBubbleUser : styles.msgBubbleAi]}>
              <Text style={[styles.msgText, item.sender === 'user' ? styles.msgTextUser : styles.msgTextAi]}>{item.text}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={loading ? <ActivityIndicator size="small" color="#8B5CF6" style={{ marginTop: 8, alignSelf: 'flex-start', marginLeft: 16 }} /> : null}
      />

      {/* Input Area */}
      <View style={styles.inputArea}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask me about your finances..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage} activeOpacity={0.8}>
          <Ionicons name="arrow-up" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    backgroundColor: '#8B5CF6',
    paddingTop: 54, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  backButton: { marginRight: 14, padding: 4 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#FFF' },
  msgRow: { marginBottom: 12, maxWidth: '82%' },
  msgRowUser: { alignSelf: 'flex-end' },
  msgRowAi: { alignSelf: 'flex-start' },
  msgBubble: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 20 },
  msgBubbleUser: { backgroundColor: '#8B5CF6', borderBottomRightRadius: 6 },
  msgBubbleAi: { backgroundColor: '#F3F4F6', borderBottomLeftRadius: 6 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextUser: { color: '#FFF' },
  msgTextAi: { color: '#111827' },
  inputArea: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFF',
  },
  textInput: {
    flex: 1, backgroundColor: '#F3F4F6',
    paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 24, fontSize: 15, color: '#111827', marginRight: 10,
  },
  sendButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
});
