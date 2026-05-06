import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Alert, Modal, ScrollView, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import api, { getSpendingLimits, updateSpendingLimits } from '../../services/api';

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('');
  const [txDate, setTxDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  
  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  // Threshold State
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('0');
  const [monthlyLimit, setMonthlyLimit] = useState('0');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.get('/transactions');
      setTransactions(res.data || []);
    } catch (err: any) {
      console.log('Error fetching transactions:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchLimits = useCallback(async () => {
    try {
      const res = await getSpendingLimits();
      setDailyLimit(String(res.data.daily_spending_limit || 0));
      setMonthlyLimit(String(res.data.monthly_spending_limit || 0));
    } catch (e) {
      console.log('Error fetching limits:', e);
    }
  }, []);

  useEffect(() => { 
    fetchTransactions(); 
    fetchLimits();
  }, [fetchTransactions, fetchLimits]);

  const handleUpdateLimits = async () => {
    try {
      await updateSpendingLimits({
        daily_spending_limit: parseFloat(dailyLimit) || 0,
        monthly_spending_limit: parseFloat(monthlyLimit) || 0
      });
      Alert.alert('Success', 'Spending thresholds updated! 🚀');
      setLimitModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save limits.');
    }
  };

  const handleAdd = async () => {
    if (!amount || !merchant) {
      Alert.alert('Missing Info', 'Please enter at least the amount and merchant name.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post('/add-transaction', {
        amount: parseFloat(amount),
        merchant,
        category: category || 'General',
        type: activeTab === 'income' ? 'credit' : 'debit',
        description: merchant,
        date: txDate.toISOString()
      });

      if (response.data.warnings && response.data.warnings.length > 0) {
        Alert.alert('Budget Alert', response.data.warnings.join('\n'));
      }

      setAmount('');
      setMerchant('');
      setCategory('');
      setTxDate(new Date());
      fetchTransactions();
    } catch (err) {
      Alert.alert('Error', 'Could not save the transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete Transaction', 'Are you sure you want to remove this record?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await api.delete(`/transactions/${id}`);
            fetchTransactions();
          } catch (err) {
            Alert.alert('Error', 'Could not delete transaction.');
          }
        }
      }
    ]);
  };

  const openEditModal = (tx: any) => {
    setEditingTx(tx);
    setEditAmount(String(tx.amount));
    setEditMerchant(tx.merchant);
    setEditCategory(tx.category);
    setEditDate(tx.date ? new Date(tx.date) : new Date());
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!editingTx) return;
    try {
      await api.put(`/transactions/${editingTx.id}`, {
        amount: parseFloat(editAmount),
        merchant: editMerchant,
        category: editCategory,
        date: editDate.toISOString(),
      });
      setEditModalVisible(false);
      fetchTransactions();
    } catch (err) {
      Alert.alert('Error', 'Failed to update transaction.');
    }
  };

  const handleCSVUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values'],
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const response = await fetch(fileUri);
      const csvText = await response.text();

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const getValue = (row: any, keys: string[]) => {
            const rowKeys = Object.keys(row);
            for (const key of keys) {
              const matchedKey = rowKeys.find(rk => rk.trim().toLowerCase() === key.toLowerCase());
              if (matchedKey) return row[matchedKey];
            }
            return null;
          };

          const parseCSVDate = (rawDate: string) => {
            if (!rawDate) return new Date();
            const str = rawDate.toString().trim();
            const parts = str.split(/[\/\-]/);
            if (parts.length === 3) {
              const m = parseInt(parts[0], 10) - 1;
              const d = parseInt(parts[1], 10);
              const y = parseInt(parts[2], 10);
              const fullYear = y < 100 ? 2000 + y : y;
              const dObj = new Date(fullYear, m, d);
              if (!isNaN(dObj.getTime())) return dObj;
            }
            const fallback = new Date(str);
            return isNaN(fallback.getTime()) ? new Date() : fallback;
          };

          const parsedData = results.data.map((row: any) => {
            const amountVal = getValue(row, ['amount', 'transaction amount', 'amt', 'value']);
            const merchantVal = getValue(row, ['merchant', 'description', 'details', 'trans details', 'payee']);
            const categoryVal = getValue(row, ['category', 'type', 'group', 'tag']);
            const dateVal = getValue(row, ['date', 'transaction date', 'trans date', 'dt']);
            const typeVal = getValue(row, ['transaction type', 'type', 'cr_dr', 'mode']);

            const amount = parseFloat(amountVal || '0');
            const isCredit = (typeVal || categoryVal || '').toString().toLowerCase().includes('credit') || 
                             (typeVal || categoryVal || '').toString().toLowerCase().includes('income') || 
                             (typeVal || '').toString().toLowerCase() === 'cr';
            
            const dateObj = parseCSVDate(dateVal);

            return {
              amount: Math.abs(amount),
              merchant: merchantVal || 'Unknown',
              category: categoryVal || (isCredit ? 'Income' : 'General'),
              description: merchantVal || 'No description',
              date: dateObj.toISOString(),
              type: isCredit ? 'credit' : 'debit'
            };
          }).filter((tx: any) => tx.amount > 0);

          if (parsedData.length === 0) {
            Alert.alert('Invalid CSV', 'No valid transaction data found');
            return;
          }

          Alert.alert('Import CSV', `Found ${parsedData.length} transactions. Import them?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              onPress: async () => {
                setLoading(true);
                try {
                  const res = await api.post('/batch-transactions', parsedData);
                  if (res.data.warnings && res.data.warnings.length > 0) {
                    Alert.alert('Budget Warning', res.data.warnings.join('\n'));
                  }
                  fetchTransactions();
                  Alert.alert('Success', 'Transactions imported successfully');
                } catch (err: any) {
                  Alert.alert('Error', 'Batch upload failed.');
                } finally {
                  setLoading(false);
                }
              }
            }
          ]);
        }
      });
    } catch (err) {
      Alert.alert('Error', 'Could not process CSV file.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Transactions</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity 
            style={styles.limitBtn} 
            onPress={() => setLimitModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={22} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.importBtn} onPress={handleCSVUpload}>
            <Ionicons name="cloud-upload-outline" size={20} color="#3B82F6" />
            <Text style={styles.importBtnText}>Import CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'expense' && styles.tabActive]}
          onPress={() => setActiveTab('expense')}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-down-circle" size={16} color={activeTab === 'expense' ? '#FFF' : '#EF4444'} />
          <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>Expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'income' && styles.tabActiveGreen]}
          onPress={() => setActiveTab('income')}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-up-circle" size={16} color={activeTab === 'income' ? '#FFF' : '#10B981'} />
          <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>Income</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchTransactions(true)} />}
      >
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Quick Add</Text>
          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Merchant"
            placeholderTextColor="#9CA3AF"
            value={merchant}
            onChangeText={setMerchant}
          />
          <TextInput
            style={styles.input}
            placeholder="Category (optional)"
            placeholderTextColor="#9CA3AF"
            value={category}
            onChangeText={setCategory}
          />
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            <Text style={styles.dateButtonText}>
              {txDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={txDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(event: any, selectedDate?: Date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) setTxDate(selectedDate);
              }}
            />
          )}
          <TouchableOpacity style={styles.saveButton} onPress={handleAdd} disabled={submitting} activeOpacity={0.85}>
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Transaction</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Transaction History</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 30 }} />
        ) : (
          <View style={{ paddingBottom: 40 }}>
            {transactions
              .filter((item: any) => {
                const txType = (item.type || 'debit').toLowerCase();
                if (activeTab === 'expense') return txType === 'expense' || txType === 'debit';
                return txType === 'income' || txType === 'credit';
              })
              .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((item: any) => {
                const isIncome = (item.type || '').toLowerCase() === 'income' || (item.type || '').toLowerCase() === 'credit';
                const txDate = new Date(item.date);
                const formattedDate = `${txDate.getDate().toString().padStart(2, '0')}/${(txDate.getMonth() + 1).toString().padStart(2, '0')}/${txDate.getFullYear()}`;
                
                return (
                  <Swipeable
                    key={item.id}
                    containerStyle={{ marginBottom: 10 }}
                    friction={2}
                    renderLeftActions={() => (
                      <TouchableOpacity style={styles.swipeEdit} onPress={() => openEditModal(item)}>
                        <Ionicons name="pencil" size={22} color="#FFF" />
                      </TouchableOpacity>
                    )}
                    renderRightActions={() => (
                      <TouchableOpacity style={styles.swipeDelete} onPress={() => handleDelete(item.id)}>
                        <Ionicons name="trash" size={22} color="#FFF" />
                      </TouchableOpacity>
                    )}
                  >
                    <View style={styles.txRow}>
                      <View style={[styles.txIconCircle, { backgroundColor: isIncome ? '#D1FAE5' : '#FEE2E2' }]}>
                        <Ionicons name={isIncome ? 'arrow-up' : 'arrow-down'} size={18} color={isIncome ? '#10B981' : '#EF4444'} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={styles.txMerchant} numberOfLines={1}>{item.description || item.merchant}</Text>
                        <Text style={styles.txMeta}>{item.category} • {formattedDate}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.txAmount, { color: isIncome ? '#10B981' : '#EF4444' }]}>
                          {isIncome ? '+' : '-'}₹{Number(item.amount).toFixed(0)}
                        </Text>
                      </View>
                    </View>
                  </Swipeable>
                );
              })}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Transaction</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" value={editAmount} onChangeText={setEditAmount} />
            <TextInput style={styles.modalInput} placeholder="Merchant" value={editMerchant} onChangeText={setEditMerchant} />
            <TextInput style={styles.modalInput} placeholder="Category" value={editCategory} onChangeText={setEditCategory} />
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowEditDatePicker(true)} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={18} color="#6B7280" />
              <Text style={styles.dateButtonText}>
                {editDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showEditDatePicker && (
              <DateTimePicker
                value={editDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event: any, selectedDate?: Date) => {
                  setShowEditDatePicker(Platform.OS === 'ios');
                  if (selectedDate) setEditDate(selectedDate);
                }}
              />
            )}
            <TouchableOpacity style={styles.updateBtn} onPress={handleUpdate}>
              <Text style={styles.updateBtnText}>Update Record</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Threshold Modal */}
      <Modal visible={limitModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Spending Thresholds</Text>
              <TouchableOpacity onPress={() => setLimitModalVisible(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Daily Spending Limit (₹)</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="e.g. 1000" value={dailyLimit} onChangeText={setDailyLimit} />
            <Text style={styles.inputLabel}>Monthly Spending Limit (₹)</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="e.g. 30000" value={monthlyLimit} onChangeText={setMonthlyLimit} />
            <TouchableOpacity style={styles.applyBtn} onPress={handleUpdateLimits}>
              <Text style={styles.applyBtnText}>Apply Thresholds</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 20, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  importBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF5FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  importBtnText: { color: '#3B82F6', fontWeight: '600', fontSize: 13, marginLeft: 6 },
  tabRow: { flexDirection: 'row', marginBottom: 18, gap: 10 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', paddingVertical: 12, borderRadius: 14, gap: 6,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  tabActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  tabActiveGreen: { backgroundColor: '#10B981', borderColor: '#10B981' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  tabTextActive: { color: '#FFF' },
  formCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 4,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 14 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, marginBottom: 12, fontSize: 15, color: '#111827',
  },
  saveButton: {
    backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 4,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  dateButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, marginBottom: 12, gap: 10,
  },
  dateButtonText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  listTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  txRow: {
    backgroundColor: '#FFF', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  txIconCircle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txMerchant: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 16, fontWeight: '700', color: '#EF4444' },
  swipeEdit: { backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 18, height: '100%' },
  swipeDelete: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 18, height: '100%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalInput: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 18, paddingVertical: 16, borderRadius: 16, marginBottom: 16, fontSize: 16
  },
  updateBtn: { backgroundColor: '#3B82F6', paddingVertical: 18, borderRadius: 18, alignItems: 'center', marginTop: 10 },
  updateBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  limitBtn: { backgroundColor: '#EBF5FF', width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 8, marginLeft: 4 },
  applyBtn: { backgroundColor: '#111827', paddingVertical: 18, borderRadius: 18, alignItems: 'center', marginTop: 10 },
  applyBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
