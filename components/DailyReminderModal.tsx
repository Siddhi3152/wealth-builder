import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface DailyReminderModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DailyReminderModal({ visible, onClose, onSuccess }: DailyReminderModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async (isNoSpend = false) => {
    setLoading(true);
    try {
      const payload = {
        amount: isNoSpend ? 0 : parseFloat(amount),
        merchant: isNoSpend ? 'No Spend Today' : 'Daily Quick Entry',
        category: isNoSpend ? 'Savings' : 'General',
        type: 'debit',
        description: isNoSpend ? 'Marked as zero spending' : description || 'Daily spending entry',
        date: new Date().toISOString()
      };

      if (!isNoSpend && (!amount || isNaN(payload.amount))) {
        Alert.alert('Invalid Amount', 'Please enter a valid spent amount.');
        setLoading(false);
        return;
      }

      await api.post('/add-transaction', payload);
      Alert.alert('Success', isNoSpend ? 'Day marked as No Spend! 🌟' : 'Spending recorded! ✅');
      setAmount('');
      setDescription('');
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to save entry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Ionicons name="notifications-circle" size={40} color="#3B82F6" />
            <Text style={styles.title}>Daily Spend Update</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.question}>How much did you spend today?</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <TextInput
            style={styles.descInput}
            placeholder="What did you spend it on? (Optional)"
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.btn, styles.noSpendBtn]} 
              onPress={() => handleSave(true)}
              disabled={loading}
            >
              <Text style={styles.noSpendBtnText}>No Spend Today</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.btn, styles.saveBtn]} 
              onPress={() => handleSave(false)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Spend</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginLeft: 10, flex: 1 },
  closeBtn: { padding: 4 },
  question: { fontSize: 16, color: '#4B5563', marginBottom: 24, fontWeight: '500' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#E5E7EB', marginBottom: 20, paddingBottom: 8 },
  currency: { fontSize: 32, fontWeight: '700', color: '#111827', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800', color: '#111827' },
  descInput: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, fontSize: 14, color: '#111827', marginBottom: 24 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  noSpendBtn: { backgroundColor: '#F3F4F6' },
  noSpendBtnText: { color: '#4B5563', fontWeight: '700', fontSize: 14 },
  saveBtn: { backgroundColor: '#3B82F6' },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
