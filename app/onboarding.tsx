import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const GOAL_SUGGESTIONS = [
  "Save for a car",
  "Build emergency fund",
  "Start investing",
  "Buy a house",
  "Travel fund",
  "Pay off debt"
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [profession, setProfession] = useState('');
  const [income, setIncome] = useState('');
  const [displayIncome, setDisplayIncome] = useState('');
  const [goal, setGoal] = useState('');
  
  const [errors, setErrors] = useState({ name: '', age: '', profession: '', income: '' });
  const [loading, setLoading] = useState(false);

  const formatIndianNumber = (numStr: string) => {
    if (!numStr) return '';
    const x = numStr.split('.');
    let lastThree = x[0].substring(x[0].length - 3);
    const otherNumbers = x[0].substring(0, x[0].length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree + (x.length > 1 ? '.' + x[1] : '');
  };

  const handleIncomeChange = (text: string) => {
    const stripped = text.replace(/[^\d]/g, '');
    setIncome(stripped);
    setDisplayIncome(formatIndianNumber(stripped));
  };

  const validateName = (text: string) => {
    if (!text) return 'Please enter a valid name (letters only, min 2 characters)';
    if (text.length < 2 || text.length > 50 || !/^[a-zA-Z\s]+$/.test(text)) {
      return 'Please enter a valid name (letters only, min 2 characters)';
    }
    return '';
  };

  const validateAge = (text: string) => {
    if (!text) return 'Please enter a valid age';
    if (!/^\d+$/.test(text)) return 'Age must be a number';
    const ageNum = parseInt(text, 10);
    if (ageNum < 18) return 'You must be at least 18 years old to use this app';
    if (ageNum > 100) return 'Please enter a valid age';
    return '';
  };

  const validateProfession = (text: string) => {
    if (text.length > 0) {
      if (text.length < 2 || text.length > 50) return 'Please enter your profession (min 2 characters)';
      if (!/[AEIOUaeiouy]/.test(text) || /(.)\1{2}/.test(text) || !/^[a-zA-Z\s\-]+$/.test(text)) {
        return 'Please enter a valid profession';
      }
    }
    return '';
  };

  const validateIncome = (text: string) => {
    if (!text) return 'Please enter a valid income amount';
    if (!/^\d+$/.test(text)) return 'Income must be a number';
    const incomeNum = parseInt(text, 10);
    if (incomeNum <= 0) return 'Income must be greater than 0';
    if (incomeNum > 9999999) return 'Please enter a valid income amount';
    return '';
  };

  const handleBlur = (field: string) => {
    setErrors(prev => ({
      ...prev,
      [field]: field === 'name' ? validateName(name) :
               field === 'age' ? validateAge(age) :
               field === 'profession' ? validateProfession(profession) :
               field === 'income' ? validateIncome(income) : ''
    }));
  };

  const isFormValid = () => {
    return (
      name.trim() !== '' && validateName(name) === '' &&
      age.trim() !== '' && validateAge(age) === '' &&
      income.trim() !== '' && validateIncome(income) === '' &&
      (profession.trim() === '' || validateProfession(profession) === '')
    );
  };

  const handleContinue = async () => {
    const errorState = {
      name: validateName(name),
      age: validateAge(age),
      profession: validateProfession(profession),
      income: validateIncome(income)
    };
    
    setErrors(errorState);

    if (errorState.name || errorState.age || errorState.profession || errorState.income) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/onboard-new-user', {
        name: name.trim(),
        age: parseInt(age),
        profession: profession.trim(),
        monthly_income: parseFloat(income), // raw unformatted income
        goal: goal.trim(),
      });

      setErrors({ name: '', age: '', profession: '', income: '' });

      await AsyncStorage.setItem('userToken', response.data.access_token);
      await AsyncStorage.setItem('userName', name.trim());

      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.msg || err?.message || 'Unknown error';
      Alert.alert('Error', `Failed to set up your account: ${msg}`);
      console.log('Onboarding error:', JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
        <Text style={styles.progressLabel}>Set up your profile</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Let's set you up</Text>
          <Text style={styles.subtitle}>Tell us a bit about yourself so we can personalize your experience.</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={[styles.input, errors.name ? styles.inputError : null]}
              placeholder="e.g. Siddhi"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              onBlur={() => handleBlur('name')}
            />
            {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={[styles.input, errors.age ? styles.inputError : null]}
              placeholder="e.g. 22"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={age}
              onChangeText={setAge}
              onBlur={() => handleBlur('age')}
            />
            {!!errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Profession</Text>
            <TextInput
              style={[styles.input, errors.profession ? styles.inputError : null]}
              placeholder="e.g. Student, Engineer, Designer"
              placeholderTextColor="#9CA3AF"
              value={profession}
              onChangeText={setProfession}
              onBlur={() => handleBlur('profession')}
            />
            {!!errors.profession && <Text style={styles.errorText}>{errors.profession}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Monthly Income (₹)</Text>
            <TextInput
              style={[styles.input, errors.income ? styles.inputError : null]}
              placeholder="e.g. 50,000"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={displayIncome}
              onChangeText={handleIncomeChange}
              onBlur={() => handleBlur('income')}
            />
            {!!errors.income && <Text style={styles.errorText}>{errors.income}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Primary Financial Goal (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Save for a car, Control spending"
              placeholderTextColor="#9CA3AF"
              value={goal}
              onChangeText={setGoal}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {GOAL_SUGGESTIONS.map((sug, idx) => (
                <TouchableOpacity key={idx} style={styles.chip} onPress={() => setGoal(sug)}>
                  <Text style={styles.chipText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.buttonSection}>
            <TouchableOpacity 
              style={[styles.primaryButton, !isFormValid() && styles.disabledButton]} 
              onPress={handleContinue} 
              disabled={loading || !isFormValid()} 
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  progressContainer: { paddingTop: 60, paddingHorizontal: 28, paddingBottom: 10, backgroundColor: '#F9FAFB' },
  progressBar: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', width: '100%' },
  progressLabel: { fontSize: 13, color: '#6B7280', textAlign: 'center', fontWeight: '500' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6B7280', lineHeight: 24, marginBottom: 32 },
  inputGroup: { marginBottom: 22 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 10 },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    color: '#111827',
  },
  inputError: { borderColor: '#ff4444' },
  errorText: { color: '#ff4444', fontSize: 13, marginTop: 6, paddingHorizontal: 4 },
  chipsContainer: { marginTop: 12, flexDirection: 'row' },
  chip: { 
    backgroundColor: '#EFF6FF', 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 20, 
    marginRight: 10,
    minWidth: 80,
    alignItems: 'center'
  },
  chipText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  buttonSection: { marginTop: 10, paddingTop: 20 },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledButton: { backgroundColor: '#cccccc', shadowOpacity: 0, elevation: 0 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
