import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function LandingScreen() {
  const router = useRouter();
  const scaleValue = useRef(new Animated.Value(0.8)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(opacityValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={['#f8f9ff', '#ffffff']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.imageContainer}>
            <Animated.View style={[styles.logoCircle, { opacity: opacityValue, transform: [{ scale: scaleValue }] }]}>
              <Ionicons name="pie-chart" size={60} color="#3B82F6" />
            </Animated.View>
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title}>WealthBuilder</Text>
            <Text style={styles.tagline}>Smart tracking for a brighter financial future</Text>
            <Text style={styles.description}>
              Track your expenses, manage investments, and get AI-powered insights to grow your wealth faster.
            </Text>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => router.push('/onboarding')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 30, justifyContent: 'center', alignItems: 'center' },
  imageContainer: { marginBottom: 40, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  textContainer: { alignItems: 'center', marginBottom: 50 },
  title: { fontSize: 36, fontWeight: '900', color: '#111827', marginBottom: 12 },
  tagline: { fontSize: 18, fontWeight: '600', color: '#3B82F6', textAlign: 'center', marginBottom: 16 },
  description: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, paddingHorizontal: 10 },
  footer: { width: '100%', paddingHorizontal: 20 },
  primaryButton: {
    backgroundColor: '#3B82F6',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
