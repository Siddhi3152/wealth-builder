import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Modal, Switch, LayoutAnimation, Platform, UIManager, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import api from '../../services/api';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const EMOJIS = ['💻', '📱', '🚗', '🏠', '✈️', '👜', '📚', '💍', '🎯', '🎁', '🎓'];

export default function GoalsScreen() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [icon, setIcon] = useState('🎯');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [surplusWarning, setSurplusWarning] = useState(null);

  const [savingsModal, setSavingsModal] = useState({ visible: false, goal: null, amount: '', fromBalance: false, date: new Date().toISOString().split('T')[0] });
  const [editModal, setEditModal] = useState({ visible: false, goal: null, name: '', target: '', duration: '', icon: '🎯' });

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/goals');
      const fetchedGoals = res.data || [];
      setGoals(fetchedGoals);
      checkAndSendNotifications(fetchedGoals);
    } catch (err: any) {
      console.log('Goals fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAndSendNotifications = async (goalsList: any[]) => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') return;
      }
      
      const lastNotified = await AsyncStorage.getItem('last_goal_notifications');
      const today = new Date().toDateString();
      if (lastNotified === today) return; 
      
      let sentNotification = false;
      for (const g of goalsList) {
        if (g.status === 'Behind') {
           await Notifications.scheduleNotificationAsync({
            content: {
              title: `⚠️ Goal Alert: ${g.name}`,
              body: g.suggestion || 'You are falling behind on this goal.',
            },
            trigger: null,
          });
          sentNotification = true;
          break; 
        } else if (g.status === 'Ahead') {
             await Notifications.scheduleNotificationAsync({
              content: {
                title: `🚀 Goal Progress: ${g.name}`,
                body: g.suggestion || 'You are ahead of schedule!',
              },
              trigger: null,
            });
            sentNotification = true;
            break;
        }
      }
      if (sentNotification) {
        await AsyncStorage.setItem('last_goal_notifications', today);
      }
    } catch(e) {
      console.log('Notification error:', e);
    }
  };

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const toggleForm = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm(!showForm);
  };

  const handleDurationBlur = async () => {
    if (target && duration) {
        const requiredMonthly = parseFloat(target) / parseInt(duration);
        if (requiredMonthly > 0 && isFinite(requiredMonthly)) {
            try {
                const res = await api.get('/surplus');
                const userSurplus = res.data.surplus || 0;
                if (requiredMonthly > userSurplus) {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setSurplusWarning(`⚠️ You need ₹${requiredMonthly.toFixed(0)}/mo but your surplus is only ₹${userSurplus.toFixed(0)}/mo. Consider a longer duration or lower target.`);
                } else {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setSurplusWarning(null);
                }
            } catch(e) {
                console.log('Surplus fetch error', e);
            }
        }
    }
  };

  const handleAdd = async () => {
    if (!name || !target || !duration) {
      Alert.alert('Missing Info', 'Please enter goal name, target amount, and duration.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/add-goal', {
        name,
        target_amount: parseFloat(target),
        current_amount: current ? parseFloat(current) : 0,
        duration_months: parseInt(duration),
        icon: icon,
      });
      setIcon('🎯'); setName(''); setTarget(''); setCurrent(''); setDuration(''); setSurplusWarning(null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowForm(false);
      fetchGoals();
    } catch (err) {
      Alert.alert('Error', 'Could not save goal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    Alert.alert('Delete Goal', 'Are you sure you want to delete this goal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/goals/${id}`);
            fetchGoals();
          } catch(e) {
            Alert.alert('Error', 'Could not delete goal.');
          }
      }}
    ]);
  };

  const handleEditSubmit = async () => {
    try {
      await api.put(`/goals/${editModal.goal.id}`, {
        name: editModal.name,
        target_amount: parseFloat(editModal.target),
        duration_months: parseInt(editModal.duration || '0'),
        icon: editModal.icon
      });
      setEditModal({ ...editModal, visible: false });
      fetchGoals();
    } catch(e) {
      Alert.alert('Error', 'Could not update goal.');
    }
  };

  const handleAddSavingsSubmit = async () => {
    if (!savingsModal.amount) return;
    try {
      await api.post(`/goals/${savingsModal.goal.id}/add-savings`, {
        amount: parseFloat(savingsModal.amount),
        from_balance: savingsModal.fromBalance,
        date: savingsModal.date
      });
      setSavingsModal({ ...savingsModal, visible: false });
      fetchGoals();
    } catch(e) {
      Alert.alert('Error', 'Could not add savings.');
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'On Track') return '#10B981'; // Green
    if (status === 'Behind') return '#EF4444'; // Red
    if (status === 'Ahead') return '#3B82F6'; // Blue
    if (status === 'Completed') return '#8B5CF6'; // Purple
    return '#6B7280';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Smart Goals</Text>

      {/* Main Toggle Button */}
      {!showForm && (
         <TouchableOpacity style={[styles.addButton, { marginBottom: 24, marginTop: 0 }]} onPress={toggleForm} activeOpacity={0.85}>
            <Text style={styles.addButtonText}>+ Create New Goal</Text>
         </TouchableOpacity>
      )}

      {/* Add Goal Form (Collapsible) */}
      {showForm && (
        <View style={styles.formCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={styles.formTitle}>Create New Goal</Text>
              <TouchableOpacity onPress={toggleForm}>
                  <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {EMOJIS.map((emoji, index) => (
                <TouchableOpacity key={index} onPress={() => setIcon(emoji)} style={[styles.emojiBox, icon === emoji && styles.emojiBoxSelected]}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput style={styles.input} placeholder="Goal Name (e.g. New Car)" placeholderTextColor="#9CA3AF" value={name} onChangeText={setName} />
          
          <View style={styles.formRow}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Target (₹)" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={target} onChangeText={setTarget} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Duration (months)" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={duration} onChangeText={setDuration} onBlur={handleDurationBlur} />
          </View>
          
          {surplusWarning && (
              <Text style={styles.warningText}>{surplusWarning}</Text>
          )}

          <TextInput style={styles.input} placeholder="Saved So Far (₹) (Optional)" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={current} onChangeText={setCurrent} />
          
          <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={submitting} activeOpacity={0.85}>
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.addButtonText}>Plan Goal</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Goals List */}
      <Text style={styles.listTitle}>Your Progress & Intelligence</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#0D9488" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const pct = Math.min(item.progress_percentage || 0, 100);
            return (
              <Swipeable
                containerStyle={{ marginBottom: 16 }}
                friction={2}
                renderLeftActions={() => (
                  <TouchableOpacity style={styles.swipeEdit} onPress={() => setEditModal({ visible: true, goal: item, name: item.name, target: String(item.target_amount), duration: '', icon: item.icon || '🎯' })}>
                    <Ionicons name="pencil" size={22} color="#FFF" />
                  </TouchableOpacity>
                )}
                renderRightActions={() => (
                  <TouchableOpacity style={styles.swipeDelete} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash" size={22} color="#FFF" />
                  </TouchableOpacity>
                )}
              >
                <View style={styles.goalCard}>
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalIcon}>{item.icon || '🎯'}</Text>
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <Text style={styles.goalName}>{item.name}</Text>
                      <Text style={styles.goalAmounts}>₹{item.current_amount} / ₹{item.target_amount}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                      <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Monthly Need</Text>
                      <Text style={styles.statValue}>₹{item.monthly_required ? item.monthly_required.toFixed(0) : 0}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Time Left</Text>
                      <Text style={styles.statValue}>{item.months_left} mo</Text>
                    </View>
                  </View>

                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: getStatusColor(item.status) }]} />
                  </View>
                  <Text style={styles.goalPct}>{pct.toFixed(0)}% Completed</Text>
                  
                  {item.suggestion && item.status === 'Behind' && (
                    <View style={[styles.suggestionBox, { backgroundColor: '#FFF3E0' }]}>
                      <Ionicons name="warning" size={16} color="#EA580C" style={{ marginRight: 6 }} />
                      <Text style={[styles.suggestionText, { color: '#EA580C' }]}>{item.suggestion}</Text>
                    </View>
                  )}

                  {item.suggestion && item.status !== 'Behind' && (
                    <View style={styles.suggestionBox}>
                      <Ionicons name="bulb-outline" size={16} color="#D97706" style={{ marginRight: 6 }} />
                      <Text style={styles.suggestionText}>{item.suggestion}</Text>
                    </View>
                  )}

                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => setSavingsModal({ visible: true, goal: item, amount: '', fromBalance: false, date: new Date().toISOString().split('T')[0] })} style={styles.actionBtn}>
                      <Ionicons name="add-circle-outline" size={20} color="#0D9488" />
                      <Text style={styles.actionBtnText}>Add Savings</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>← Swipe to edit / delete →</Text>
                  </View>
                </View>
              </Swipeable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="flag-outline" size={36} color="#D1D5DB" />
              <Text style={styles.emptyText}>No financial goals active</Text>
            </View>
          }
        />
      )}

      {/* Add Savings Modal */}
      <Modal visible={savingsModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Savings to {savingsModal.goal?.name}</Text>
            
            <TextInput style={styles.input} placeholder="Amount (₹)" keyboardType="numeric"
                       value={savingsModal.amount} onChangeText={(val) => setSavingsModal({...savingsModal, amount: val})} />
            
            <TextInput style={styles.input} placeholder="Date of Saving (YYYY-MM-DD)"
                       value={savingsModal.date} onChangeText={(val) => setSavingsModal({...savingsModal, date: val})} />
            
            <View style={styles.toggleRow}>
              <View style={{flex: 1}}>
                <Text style={styles.toggleTitle}>Deduct from Balance</Text>
                <Text style={styles.toggleDesc}>Creates a transaction and reduces your overall balance.</Text>
              </View>
              <Switch 
                value={savingsModal.fromBalance} 
                onValueChange={(val) => setSavingsModal({...savingsModal, fromBalance: val})}
                trackColor={{ false: '#D1D5DB', true: '#0D9488' }}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSavingsModal({...savingsModal, visible: false})}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleAddSavingsSubmit}>
                <Text style={styles.submitBtnText}>Add Funds</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Goal</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {EMOJIS.map((emoji, index) => (
                  <TouchableOpacity key={index} onPress={() => setEditModal({ ...editModal, icon: emoji })} style={[styles.emojiBox, editModal.icon === emoji && styles.emojiBoxSelected]}>
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput style={styles.input} placeholder="Name" value={editModal.name} onChangeText={(val) => setEditModal({...editModal, name: val})} />
            <TextInput style={styles.input} placeholder="Target Amount" keyboardType="numeric" value={editModal.target} onChangeText={(val) => setEditModal({...editModal, target: val})} />
            <TextInput style={styles.input} placeholder="New Duration (Months from now)" keyboardType="numeric" value={editModal.duration} onChangeText={(val) => setEditModal({...editModal, duration: val})} />
            
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal({...editModal, visible: false})}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleEditSubmit}>
                <Text style={styles.submitBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 20, paddingTop: 56 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 20 },
  formCard: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 20, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  formTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  formRow: { flexDirection: 'row', marginBottom: 4 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginBottom: 12, fontSize: 15, color: '#111827',
  },
  addButton: {
    backgroundColor: '#0D9488', paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    marginTop: 4, shadowColor: '#0D9488', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  addButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  listTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  goalCard: {
    backgroundColor: '#FFF', padding: 20, borderRadius: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  goalIcon: { fontSize: 28 },
  goalName: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 2 },
  goalAmounts: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 16, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginBottom: 2 },
  statValue: { fontSize: 16, color: '#111827', fontWeight: '700' },
  progressBg: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  goalPct: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', marginTop: 6, fontWeight: '600' },
  suggestionBox: { flexDirection: 'row', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  suggestionText: { color: '#92400E', fontSize: 13, flex: 1, fontWeight: '500' },
  warningText: { color: '#EF4444', fontSize: 13, marginBottom: 12, marginTop: -4, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDFA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  actionBtnText: { color: '#0D9488', fontWeight: '600', marginLeft: 6, fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 10 },
  swipeEdit: { backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 18, height: '100%' },
  swipeDelete: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 70, borderRadius: 18, height: '100%' },
  emojiBox: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginRight: 8 },
  emojiBoxSelected: { borderColor: '#0D9488', backgroundColor: '#F0FDFA' },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 20 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  toggleDesc: { fontSize: 13, color: '#6B7280' },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { color: '#4B5563', fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#0D9488', borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
});
