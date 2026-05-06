import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, Dimensions, Alert, Modal, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, LineChart } from 'react-native-chart-kit';
import api, { getSpendingLimits, getSettings, updateSettings } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DailyReminderModal from '../../components/DailyReminderModal';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isExpoGo = Constants.appOwnership === 'expo';

export default function DashboardScreen() {
  const router = useRouter();
  const [surplus, setSurplus] = useState({ income: 0, expenses: 0, surplus: 0, salary: 0 });
  const [insights, setInsights] = useState({ top_categories: [], total_spent: 0 });
  const [suggestions, setSuggestions] = useState({ suggestion: '', amount: 0 });
  const [healthScore, setHealthScore] = useState({ score: 50, status: 'Good' });
  const [trends, setTrends] = useState({ labels: [], expense_data: [], income_data: [] });
  const [userProfile, setUserProfile] = useState({ name: '', salary: 0, profession: '' });
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState(0);
  
  // Settings & Reminder State (Persisted)
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  
  // Settings Modal State (Temporary edits)
  const [tempEnabled, setTempEnabled] = useState(false);
  const [tempTime, setTempTime] = useState('21:00');
  
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isDailyUpdateVisible, setIsDailyUpdateVisible] = useState(false);

  const syncNotificationSchedule = async (enabled: boolean, time: string) => {
    try {
      // First, cancel all previous notifications from this app
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Small buffer to ensure OS registers cancellation before new schedule
      await new Promise(resolve => setTimeout(resolve, 500));

      if (enabled) {
        const [hour, minute] = time.split(':').map(Number);
        if (!isNaN(hour) && !isNaN(minute)) {
          // Manual calculation of time until the next reminder
          const now = new Date();
          const target = new Date();
          target.setHours(hour, minute, 0, 0);

          // If time is now or passed (plus 2-min buffer), set to tomorrow
          // This prevents instant notifications upon saving
          const bufferTime = new Date(now.getTime() + 120000); // 2 min buffer
          if (target.getTime() <= bufferTime.getTime()) {
            target.setDate(target.getDate() + 1);
          }

          // Use the absolute Date object directly which is much more reliable
          // than calculating seconds repeatedly.
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Wealth Builder Reminder 💰",
              body: "How much did you spend today? 💸",
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: target, // Expo supports a direct Date object for exact-time one-off notifications
          });
          console.log(`Notification scheduled for ${target.toLocaleString()}`);
        }
      }
    } catch (e) {
      console.log('Error scheduling notification:', e);
    }
  };

  // Helper to safely get the local day string avoiding UTC shift bugs
  const getLocalTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchData = useCallback(async () => {
    try {
      api.get('/surplus').then(res => setSurplus(res.data)).catch(e => console.log('Surplus error:', e.message));
      api.get('/spending-insights').then(res => setInsights(res.data)).catch(e => console.log('Insights error:', e.message));
      api.get('/monthly-trends').then(res => setTrends(res.data)).catch(e => console.log('Trends error:', e.message));
      api.get('/investment-suggestions').then(res => setSuggestions(res.data)).catch(e => console.log('Suggestions error:', e.message));
      api.get('/financial-health').then(res => setHealthScore(res.data)).catch(e => console.log('Health error:', e.message));
      api.get('/user-profile').then(res => setUserProfile(res.data)).catch(e => console.log('Profile error:', e.message));
      api.get('/recent-transactions').then(res => setRecentTransactions(res.data)).catch(e => console.log('Recent TX error:', e.message));
      getSpendingLimits().then(res => setMonthlyLimit(res.data.monthly_spending_limit || 0)).catch(e => console.log('Limits error:', e.message));
      
      getSettings().then(async res => {
        setReminderEnabled(res.data.reminder_enabled);
        setReminderTime(res.data.reminder_time);
        
        // Only sync if there are no existing notifications to prevent duplicate trigger bugs
        if (res.data.reminder_enabled) {
          const scheduled = await Notifications.getAllScheduledNotificationsAsync();
          if (scheduled.length === 0) {
            syncNotificationSchedule(res.data.reminder_enabled, res.data.reminder_time);
          }
        } else {
          Notifications.cancelAllScheduledNotificationsAsync();
        }
      }).catch(e => console.log('Settings error:', e.message));
    } catch (err) {
      console.log('Dashboard fetch error');
    }
  }, []);

  const saveSettings = async () => {
    try {
      // 1. Explicit Check for Permissions if enabling
      if (tempEnabled) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in your phone settings to receive daily reminders.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      await updateSettings({ reminder_enabled: tempEnabled, reminder_time: tempTime });
      await syncNotificationSchedule(tempEnabled, tempTime);
      
      // Prevent immediate in-app popup if the saved time is past today
      if (tempEnabled) {
        const now = new Date();
        const [h, m] = tempTime.split(':').map(Number);
        const rDate = new Date();
        rDate.setHours(h, m, 0, 0);
        if (now >= rDate) {
          const todayStr = getLocalTodayString();
          await AsyncStorage.setItem('last_reminder_seen_date', todayStr);
        }
      }

      // Update persistent local state
      setReminderEnabled(tempEnabled);
      setReminderTime(tempTime);
      
      Alert.alert('Success', 'Settings updated! 🔔');
      setIsSettingsVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const openSettings = () => {
    // Initialize temporary editing state with current persisted values
    setTempEnabled(reminderEnabled);
    setTempTime(reminderTime);
    setIsSettingsVisible(true);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userEmail');
    router.replace('/');
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      
      // Check for notification-triggered modal
      AsyncStorage.getItem('trigger_daily_modal').then(val => {
        if (val === 'true') {
          setIsDailyUpdateVisible(true);
          AsyncStorage.removeItem('trigger_daily_modal');
        } else {
          // Robust fallback: Check if time has passed and not seen yet
          const checkTrigger = async () => {
            if (!reminderEnabled) return;
            const now = new Date();
            const [h, m] = reminderTime.split(':').map(Number);
            const rDate = new Date();
            rDate.setHours(h, m, 0, 0);
            
            if (now >= rDate) {
              const todayStr = getLocalTodayString();
              const lastSeen = await AsyncStorage.getItem('last_reminder_seen_date');
              if (lastSeen !== todayStr) {
                setIsDailyUpdateVisible(true);
                await AsyncStorage.setItem('last_reminder_seen_date', todayStr);
              }
            }
          };
          checkTrigger();
        }
      });
    }, [fetchData, reminderEnabled, reminderTime])
  );

  // Auto-Reminder Logic
  useEffect(() => {
    const checkReminder = async () => {
      if (!reminderEnabled) return;
      
      const now = new Date();
      const [h, m] = reminderTime.split(':').map(Number);
      const reminderDate = new Date();
      reminderDate.setHours(h, m, 0, 0);

      if (now >= reminderDate) {
        const todayStr = getLocalTodayString();
        const lastSeen = await AsyncStorage.getItem('last_reminder_seen_date');
        
        if (lastSeen !== todayStr) {
          setIsDailyUpdateVisible(true);
          await AsyncStorage.setItem('last_reminder_seen_date', todayStr);
        }
      }
    };

    const interval = setInterval(checkReminder, 60000); // Check every minute
    checkReminder();
    return () => clearInterval(interval);
  }, [reminderEnabled, reminderTime]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const scoreColor = healthScore.score >= 80 ? '#10B981' : healthScore.score >= 60 ? '#F59E0B' : '#EF4444';
  const spentThisMonth = surplus.expenses || 0;
  const budgetPercent = monthlyLimit > 0 ? Math.min((spentThisMonth / monthlyLimit) * 100, 100) : 0;
  const isOverBudget = monthlyLimit > 0 && spentThisMonth > monthlyLimit;

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3B82F6']} />}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerLabel}>Total Surplus</Text>
              <Text style={styles.headerAmount} adjustsFontSizeToFit numberOfLines={1}>₹{(surplus.surplus || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={styles.salaryBadge}>
                <Text style={styles.salaryLabel}>MY SALARY</Text>
                <Text style={styles.salaryAmount}>
                  ₹{(surplus.salary || userProfile.salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={() => setIsSettingsVisible(true)}>
                <Ionicons name="settings-outline" size={20} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerStat}>
              <Ionicons name="arrow-up-circle" size={16} color="rgba(255,255,255,0.7)" style={{ marginBottom: 2 }} />
              <Text style={styles.headerStatLabel}>Income</Text>
              <Text style={styles.headerStatValue}>₹{(surplus.income || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStat}>
              <Ionicons name="arrow-down-circle" size={16} color="rgba(255,255,255,0.7)" style={{ marginBottom: 2 }} />
              <Text style={styles.headerStatLabel}>Expenses</Text>
              <Text style={styles.headerStatValue}>₹{(surplus.expenses || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>
        </View>

        {monthlyLimit > 0 && (
          <View style={styles.section}>
            <View style={styles.budgetCard}>
              <View style={styles.budgetHeader}>
                <Text style={styles.budgetTitle}>Monthly Budget</Text>
                <Text style={[styles.budgetPercent, { color: isOverBudget ? '#EF4444' : '#3B82F6' }]}>
                  {Math.round((spentThisMonth / monthlyLimit) * 100)}%
                </Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${budgetPercent}%`, backgroundColor: isOverBudget ? '#EF4444' : '#3B82F6' }]} />
              </View>
              <View style={styles.budgetInfo}>
                <Text style={styles.budgetInfoText}>₹{spentThisMonth.toLocaleString()} / ₹{monthlyLimit.toLocaleString()}</Text>
                <Text style={[styles.budgetStatusText, { color: isOverBudget ? '#EF4444' : '#10B981' }]}>
                  {isOverBudget ? "You are exceeding your budget" : "You're doing great!"}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.healthCard}>
            <View style={[styles.healthScoreBadge, { backgroundColor: scoreColor + '20' }]}>
              <Text style={[styles.healthScoreNumber, { color: scoreColor }]}>{healthScore.score}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.healthTitle}>Financial Health</Text>
              <Text style={[styles.healthStatus, { color: scoreColor }]}>{healthScore.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.quickAction} onPress={() => setIsDailyUpdateVisible(true)} activeOpacity={0.7}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="timer-outline" size={26} color="#F97316" />
              </View>
              <Text style={styles.quickActionLabel}>Daily Entry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(tabs)/transactions')} activeOpacity={0.7}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#EBF5FF' }]}>
                <Ionicons name="add-circle" size={26} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionLabel}>Add Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/ai-chat')} activeOpacity={0.7}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="sparkles" size={26} color="#8B5CF6" />
              </View>
              <Text style={styles.quickActionLabel}>Ask AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.aiCard}>
            <Ionicons name="sparkles" size={22} color="#8B5CF6" />
            <Text style={styles.aiTitle}>AI Suggestion</Text>
            <Text style={styles.aiText}>
              {suggestions.suggestion || 'Keep tracking your expenses to get personalized suggestions.'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Insights</Text>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Category Breakdown</Text>
            {insights.top_categories.length > 0 ? (
              <PieChart
                data={insights.top_categories.map((c: any, i: number) => ({
                  name: c.category,
                  population: c.amount,
                  color: ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6'][i % 5],
                  legendFontColor: '#4B5563',
                  legendFontSize: 12,
                }))}
                width={SCREEN_WIDTH - 80}
                height={180}
                chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
              />
            ) : (
              <Text style={styles.emptyChartText}>Add transactions to see breakdown</Text>
            )}
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Trend</Text>
            {trends.labels && trends.labels.length > 0 ? (
              <LineChart
                data={{
                  labels: trends.labels,
                  datasets: [
                    { data: trends.expense_data || [], color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 2 },
                    { data: trends.income_data || [], color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 2 }
                  ],
                  legend: ['Expenses', 'Income']
                }}
                width={SCREEN_WIDTH - 60}
                height={220}
                chartConfig={{
                  backgroundColor: '#ffffff',
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: '4', strokeWidth: '2', stroke: '#3B82F6' }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
            ) : (
              <Text style={styles.emptyChartText}>No data available for trends</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.listSectionTitle}>Recent Insights</Text>
          {recentTransactions && recentTransactions.length > 0 ? (
            recentTransactions.map((tx: any, i: number) => {
              const txDate = new Date(tx.date);
              const formattedDate = `${txDate.getDate().toString().padStart(2, '0')}/${(txDate.getMonth() + 1).toString().padStart(2, '0')}/${txDate.getFullYear()}`;
              const isInc = (tx.type || '').toLowerCase().includes('income') || (tx.type || '').toLowerCase().includes('credit');
              return (
                <View key={tx.id || i} style={styles.spendingRow}>
                  <View style={[styles.spendingDot, { backgroundColor: isInc ? '#10B981' : '#EF4444' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spendingCategory} numberOfLines={1}>{tx.description || tx.merchant || 'Unknown'}</Text>
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{tx.category} • {formattedDate}</Text>
                  </View>
                  <Text style={[styles.spendingAmount, { color: isInc ? '#10B981' : '#EF4444' }]}>
                    {isInc ? '+' : '-'}₹{(tx.amount || 0).toFixed(0)}
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No transactions recorded yet</Text>
            </View>
          )}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Modern Settings Sheets */}
      <Modal visible={isSettingsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Daily Reminder</Text>
              <TouchableOpacity onPress={() => setIsSettingsVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Enable Reminder</Text>
                <Text style={styles.settingSub}>Ask about today's spend automatically.</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setTempEnabled(!tempEnabled)}
                style={[styles.toggle, { backgroundColor: tempEnabled ? '#3B82F6' : '#E5E7EB' }]}
              >
                <View style={[styles.toggleDot, { transform: [{ translateX: tempEnabled ? 20 : 0 }] }]} />
              </TouchableOpacity>
            </View>

            {tempEnabled && (
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Notification Time</Text>
                  <Text style={styles.settingSub}>24-hour format (e.g., 20:30)</Text>
                </View>
                <TextInput 
                  style={styles.timeInput}
                  value={tempTime}
                  onChangeText={setTempTime}
                  placeholder="21:00"
                  maxLength={5}
                />
              </View>
            )}

            <TouchableOpacity style={styles.saveSettingsBtn} onPress={saveSettings}>
              <Text style={styles.saveSettingsText}>Save Preferences</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DailyReminderModal 
        visible={isDailyUpdateVisible}
        onClose={() => setIsDailyUpdateVisible(false)}
        onSuccess={fetchData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerCard: {
    backgroundColor: '#3B82F6', paddingTop: 60, paddingBottom: 28, paddingHorizontal: 24,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32, elevation: 10,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  iconButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  headerAmount: { color: '#FFF', fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  salaryBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  salaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  salaryAmount: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  headerStat: { flex: 1 },
  headerStatDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  headerStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  headerStatValue: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 14 },
  healthCard: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 3,
  },
  healthScoreBadge: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  healthScoreNumber: { fontSize: 24, fontWeight: '800' },
  healthTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 2 },
  healthStatus: { fontSize: 14, fontWeight: '700' },
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAction: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 18, alignItems: 'center', flex: 1, marginHorizontal: 4, elevation: 2,
  },
  quickActionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', textAlign: 'center' },
  aiCard: { backgroundColor: '#F5F3FF', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#EDE9FE' },
  aiTitle: { fontSize: 17, fontWeight: '700', color: '#6D28D9', marginTop: 8, marginBottom: 6 },
  aiText: { fontSize: 14, color: '#7C3AED', lineHeight: 22 },
  chartCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center', elevation: 4,
  },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 15, alignSelf: 'flex-start' },
  emptyChartText: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginVertical: 30 },
  listSectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 14 },
  spendingRow: {
    backgroundColor: '#FFF', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1,
  },
  spendingDot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  spendingCategory: { flex: 1, fontSize: 16, fontWeight: '600', color: '#374151' },
  spendingAmount: { fontSize: 16, fontWeight: '700', color: '#EF4444' },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 18, paddingVertical: 40, alignItems: 'center', elevation: 1 },
  emptyText: { color: '#9CA3AF', fontSize: 15, fontWeight: '600', marginTop: 12 },

  // Budget Styles
  budgetCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 20, elevation: 4,
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  budgetTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  budgetPercent: { fontSize: 18, fontWeight: '800' },
  progressBarContainer: { height: 10, backgroundColor: '#F3F4F6', borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  progressBar: { height: '100%', borderRadius: 5 },
  budgetInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetInfoText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  budgetStatusText: { fontSize: 12, fontWeight: '700' },

  // Settings Sheet Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  settingsSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 50 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  settingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 16 },
  settingLabel: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
  settingSub: { fontSize: 13, color: '#6B7280' },
  toggle: { width: 48, height: 28, borderRadius: 14, paddingHorizontal: 4, justifyContent: 'center' },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF', elevation: 2 },
  timeInput: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, fontWeight: '700', color: '#111827', width: 80, textAlign: 'center' },
  saveSettingsBtn: { backgroundColor: '#3B82F6', borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 10 },
  saveSettingsText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
