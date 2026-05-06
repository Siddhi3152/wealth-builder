import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet, Alert, Modal, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import api from '../../services/api';

export default function InvestmentsScreen() {
  const [portfolio, setPortfolio] = useState({ holdings: [], total_invested: 0, total_value: 0, total_profit_loss: 0 });
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/portfolio');
      setPortfolio(res.data || { holdings: [], total_invested: 0, total_value: 0, total_profit_loss: 0 });
    } catch (err) {
      console.log('Portfolio fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const handleSubmit = async () => {
    if (!symbol || !symbol.trim()) {
      Alert.alert('Invalid Symbol', 'Please enter a valid symbol.');
      return;
    }
    if (!qty || !price) {
      Alert.alert('Missing Info', 'Please fill all fields.');
      return;
    }
    setSubmitting(true);
    try {
      if (editId) {
        await api.delete(`/delete-investment/${editId}`);
      }
      await api.post('/add-investment', {
        symbol: symbol.toUpperCase(),
        quantity: parseFloat(qty),
        purchase_price: parseFloat(price),
      });
      setSymbol(''); setQty(''); setPrice('');
      setEditId(null);
      setModalVisible(false);
      fetchPortfolio();
    } catch (err) {
      Alert.alert('Error', 'Could not save investment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Holding', 'Are you sure you want to remove this holding?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/delete-investment/${id}`);
            fetchPortfolio();
          } catch (e) {
            Alert.alert('Error', 'Could not delete investment.');
          }
      }}
    ])
  }

  const plColor = portfolio.total_profit_loss >= 0 ? '#10B981' : '#EF4444';

  const formatINR = (amount, decimals = 0) => {
    if (amount === null || amount === undefined || isNaN(amount)) return "—";
    const prefix = amount < 0 ? "-₹" : "₹";
    return prefix + Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const validHoldings = portfolio.holdings.filter(item => 
    item.quantity && item.quantity > 0 && 
    item.total_invested && item.total_invested > 0 && 
    item.price_error !== 'not_found' && item.price_error !== 'unavailable' &&
    item.current_price !== null && item.current_price > 0 && item.currency === 'INR'
  );
  const profitableHoldings = validHoldings.filter(item => (item.profit_loss || 0) >= 0);
  const profitRatio = validHoldings.length > 0 ? profitableHoldings.length / validHoldings.length : 0;

  const filteredHoldings = portfolio.holdings.filter((item) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Profit') return (item.profit_loss || 0) > 0;
    if (activeFilter === 'Loss') return item.profit_loss !== null && item.profit_loss < 0;
    if (activeFilter === 'Indian') return item.currency !== 'USD';
    if (activeFilter === 'US') return item.currency === 'USD';
    return true;
  });

  const renderItem = ({ item }) => {
    const isInvalid = !item.quantity || item.quantity === 0 || !item.total_invested || item.total_invested === 0 || item.price_error === 'not_found';
    const isUSD = item.currency === 'USD';
    
    let bgTint = '#FFF';
    if (isInvalid) {
      bgTint = '#f5f5f5';
    } else if (isUSD) {
      bgTint = '#FFF';
    } else if ((item.profit_loss || 0) >= 0) {
      bgTint = '#f0fff4';
    } else {
      bgTint = '#fff0f0';
    }

    let currentPriceDisplay = '—';
    if (item.price_error === 'not_found') currentPriceDisplay = 'Symbol not found';
    else if (item.price_error === 'unavailable') currentPriceDisplay = 'Live price unavailable';
    else if (isUSD && item.current_price !== null) currentPriceDisplay = `USD ${(item.current_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    else if (item.current_price !== null) currentPriceDisplay = formatINR(item.current_price, 2);

    const isAboveBreakeven = (item.current_price !== null && item.current_price !== undefined) && (item.current_price >= item.breakeven_price);
    const itemPlColor = (item.profit_loss || 0) >= 0 ? '#10B981' : '#EF4444';

    const rightActions = () => (
      <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(item.id)}>
        <Ionicons name="trash" size={24} color="#FFF" />
      </TouchableOpacity>
    );

    const leftActions = () => (
      <TouchableOpacity style={styles.editAction} onPress={() => {
        setSymbol(item.symbol);
        setQty(String(item.quantity || ''));
        setPrice(String(item.purchase_price || ''));
        setEditId(item.id);
        setModalVisible(true);
      }}>
        <Ionicons name="pencil" size={24} color="#FFF" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderLeftActions={leftActions} renderRightActions={rightActions} friction={2} containerStyle={{ marginBottom: 12 }}>
        <View style={[styles.holdingRow, { backgroundColor: bgTint, borderStyle: isInvalid ? 'dashed' : 'solid', borderWidth: isInvalid ? 1 : 0, borderColor: '#D1D5DB' }]}>
          <View style={{ width: '100%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isInvalid && <Ionicons name="warning" size={16} color="#EF4444" style={{ marginRight: 6 }} />}
                <Text style={styles.holdingSymbol}>{item.symbol}</Text>
              </View>
              {isInvalid ? (
                 <Text style={styles.holdingValue}>—</Text>
              ) : isUSD ? (
                 <Text style={styles.holdingValue}>USD {(item.current_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              ) : (
                 <Text style={styles.holdingValue}>{formatINR(item.current_value)}</Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.holdingMeta}>{item.quantity} units</Text>
              {isInvalid ? (
                 <Text style={{}}></Text>
              ) : isUSD ? (
                 <Text style={[styles.holdingPl, { color: '#6B7280' }]}>P&L N/A (USD stock)</Text>
              ) : (
                 <Text style={[styles.holdingPl, { color: itemPlColor }]}>
                   {(item.profit_loss || 0) > 0 ? '+' : ''}{formatINR(item.profit_loss)} ({(item.pl_percentage === null || item.pl_percentage === undefined) ? "—" : item.pl_percentage.toFixed(1)}%)
                 </Text>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: isInvalid ? '#D1D5DB' : '#E5E7EB', marginBottom: 8 }} />

            {isUSD ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#9CA3AF', flex: 1, fontWeight: '500', fontStyle: 'italic' }}>
                  Break-even comparison unavailable (USD stock)
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#6B7280', flex: 1, fontWeight: '500' }}>
                  Break-even: {isInvalid ? "—" : formatINR(item.breakeven_price, 2)} | Current: {currentPriceDisplay}
                </Text>
                {isInvalid ? (
                  <Ionicons name="pencil" size={16} color="#9CA3AF" />
                ) : !item.price_error && item.current_price !== null && (
                   isAboveBreakeven ? <Ionicons name="checkmark-circle" size={16} color="#10B981" /> : <Ionicons name="warning" size={16} color="#EF4444" />
                )}
              </View>
            )}
          </View>
        </View>
      </Swipeable>
    )
  };

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Investments</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
        <Text style={styles.summaryValue}>{formatINR(portfolio.total_value)}</Text>
        <View style={styles.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summarySubLabel}>Invested</Text>
            <Text style={styles.summarySubValue}>{formatINR(portfolio.total_invested)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summarySubLabel}>Profit / Loss</Text>
            <Text style={[styles.summarySubValue, { color: plColor }]}>
              {(portfolio.total_profit_loss || 0) > 0 ? '+' : ''}{formatINR(portfolio.total_profit_loss)}
            </Text>
          </View>
        </View>
        
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressFill, { width: `${profitRatio * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{profitableHoldings.length} of {validHoldings.length} holdings in profit</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 20 }}>
        {['All', 'Profit', 'Loss', 'Indian', 'US'].map(f => (
          <TouchableOpacity key={f} onPress={() => setActiveFilter(f)} style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.listTitle, { marginTop: 12 }]}>Your Assets</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filteredHoldings}
          keyExtractor={(i: any) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} colors={['#6366F1']} />}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="bar-chart-outline" size={36} color="#D1D5DB" />
              <Text style={styles.emptyText}>No investments found</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => { setEditId(null); setSymbol(''); setQty(''); setPrice(''); setModalVisible(true); }}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={isModalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.sheetTitle}>{editId ? 'Edit Holding' : 'Add Holding'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabel}>Symbol (e.g. AAPL, RELIANCE)</Text>
              <TextInput style={styles.input} placeholder="Symbol" placeholderTextColor="#9CA3AF" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" />
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={qty} onChangeText={setQty} />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>Purchase Price</Text>
                <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={price} onChangeText={setPrice} />
              </View>
            </View>
            <TouchableOpacity style={[styles.addButton, { marginTop: 24 }]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.addButtonText}>{editId ? 'Save Changes' : 'Add to Portfolio'}</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 20, paddingTop: 56 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#6366F1', borderRadius: 22, padding: 24, marginBottom: 16,
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  summaryValue: { color: '#FFF', fontSize: 34, fontWeight: '800', marginVertical: 8, letterSpacing: -0.5 },
  summaryRow: { flexDirection: 'row', marginTop: 8 },
  summarySubLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  summarySubValue: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  progressBarContainer: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, marginTop: 20, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 3 },
  progressLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 8, fontWeight: '500' },
  filterScroll: { marginBottom: 12, flexGrow: 0, flexShrink: 0, minHeight: 40 },
  filterChip: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFF', marginRight: 10, borderWidth: 1, borderColor: '#cccccc', alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#333333' },
  filterChipTextActive: { color: '#FFF' },
  listTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  holdingRow: {
    paddingVertical: 18, paddingHorizontal: 18, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  holdingSymbol: { fontSize: 17, fontWeight: '800', color: '#111827' },
  holdingMeta: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  holdingValue: { fontSize: 17, fontWeight: '700', color: '#111827' },
  holdingPl: { fontSize: 14, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 10 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#6366F1', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4B5563', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, fontSize: 15, color: '#111827' },
  addButton: { backgroundColor: '#6366F1', paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  editAction: { backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 16, height: '100%' },
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 16, height: '100%' }
});
