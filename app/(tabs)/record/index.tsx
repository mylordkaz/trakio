import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import Card from '@/components/Card';
import { CIRCUITS } from '@/constants/data';

const CHECKLIST = [
  'startFinishDetected',
  'gpsLock',
  'vehicleSelected',
  'storageAvailable',
] as const;

export default function PreSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCircuit, setSelectedCircuit] = useState(CIRCUITS[0]);
  const [showCircuitPicker, setShowCircuitPicker] = useState(false);

  return (
    <View className="flex-1 bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['rgba(16,185,129,0.15)', '#18181b', '#18181b']}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-400">{i18n.t('preSession.title')}</Text>
            <Text className="text-xs text-zinc-400">12:12 PM</Text>
          </View>

          {/* Title + READY badge */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-400">Ready to record</Text>
              <Text className="text-2xl font-semibold tracking-tight text-white">Track Day · Session 3</Text>
            </View>
            <View className="flex-row items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 border border-emerald-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <Text className="text-sm text-emerald-400">{i18n.t('session.ready')}</Text>
            </View>
          </View>

          {/* Track Selection */}
          <View className="rounded-3xl bg-black/40 border border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-zinc-400">Selected Circuit</Text>
              <Pressable onPress={() => setShowCircuitPicker(!showCircuitPicker)}>
                <Text className="text-sm font-medium text-emerald-400">
                  {showCircuitPicker ? i18n.t('common.done') : 'Change'}
                </Text>
              </Pressable>
            </View>

            {!showCircuitPicker ? (
              <Pressable onPress={() => setShowCircuitPicker(true)}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-xl font-semibold tracking-tight text-white">{selectedCircuit.name}</Text>
                    <Text className="text-sm text-zinc-400 mt-0.5">
                      {selectedCircuit.country} · {selectedCircuit.length} · {selectedCircuit.corners} corners
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#71717a" />
                </View>
                <View className="flex-row gap-2 mt-3">
                  <View className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-500 mb-0.5">Last Visit</Text>
                    <Text className="text-sm font-medium text-white">Mar 10, 2026</Text>
                  </View>
                  <View className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
                    <Text className="text-xs text-zinc-500 mb-0.5">{i18n.t('session.bestLap')}</Text>
                    <Text className="text-sm font-medium text-white">1:48.771</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View className="gap-2">
                {CIRCUITS.map((c) => (
                  <Pressable
                    key={c.name}
                    onPress={() => { setSelectedCircuit(c); setShowCircuitPicker(false); }}
                    className={`flex-row items-center justify-between rounded-2xl px-3 py-2.5 border ${
                      selectedCircuit.name === c.name
                        ? 'bg-emerald-500/10 border-emerald-400/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <View>
                      <Text className="text-sm font-medium text-white">{c.name}</Text>
                      <Text className="text-xs text-zinc-500">{c.length} · {c.corners} corners</Text>
                    </View>
                    {selectedCircuit.name === c.name && (
                      <Ionicons name="checkmark" size={16} color="#34d399" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Vehicle & GPS */}
          <View className="rounded-3xl bg-black/40 border border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-zinc-400">{i18n.t('preSession.selectedVehicle')}</Text>
              <Text className="text-sm text-zinc-400">{i18n.t('preSession.trackMode')}</Text>
            </View>
            <Text className="text-xl font-semibold tracking-tight text-white mb-3">GR86 Track Build</Text>
            <View className="flex-row gap-2">
              <View className="flex-1 rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30">
                <Text className="text-xs text-zinc-400 mb-1">{i18n.t('preSession.gps')}</Text>
                <Text className="text-base font-medium text-white">{i18n.t('telemetry.strong')}</Text>
              </View>
              <View className="flex-1 rounded-2xl p-3 border bg-white/5 border-white/10">
                <Text className="text-xs text-zinc-400 mb-1">{i18n.t('preSession.satellites')}</Text>
                <Text className="text-base font-medium text-white">18</Text>
              </View>
              <View className="flex-1 rounded-2xl p-3 border bg-white/5 border-white/10">
                <Text className="text-xs text-zinc-400 mb-1">{i18n.t('preSession.battery')}</Text>
                <Text className="text-base font-medium text-white">92%</Text>
              </View>
            </View>
          </View>

          {/* Conditions */}
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-3">
              <Text className="text-xs text-zinc-400 mb-1">{i18n.t('preSession.trackTemp')}</Text>
              <Text className="text-lg font-semibold text-white">28°C</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-3">
              <Text className="text-xs text-zinc-400 mb-1">{i18n.t('preSession.airTemp')}</Text>
              <Text className="text-lg font-semibold text-white">24°C</Text>
            </View>
          </View>

          {/* Session Checklist */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-white">{i18n.t('preSession.sessionChecklist')}</Text>
                <Text className="text-xs text-zinc-400">All systems verified before recording</Text>
              </View>
              <Text className="text-sm text-emerald-400">{i18n.t('preSession.allReady', { count: 4, total: 4 })}</Text>
            </View>
            <View className="gap-2">
              {CHECKLIST.map((key) => (
                <View key={key} className="flex-row items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5">
                  <Text className="text-sm text-white">{i18n.t(`preSession.${key}`)}</Text>
                  <Text className="text-sm font-medium text-emerald-400">{i18n.t('common.ok')}</Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Session Config */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-white">{i18n.t('sessionConfig.title')}</Text>
                <Text className="text-xs text-zinc-400">{i18n.t('sessionConfig.subtitle')}</Text>
              </View>
              <Text className="text-xs text-zinc-400">{i18n.t('common.edit')}</Text>
            </View>
            <View className="gap-3">
              {[
                [i18n.t('sessionConfig.timingMode'), 'Auto Lap'],
                [i18n.t('sessionConfig.units'), 'km/h'],
                [i18n.t('sessionConfig.dataCapture'), 'GPS + Speed'],
              ].map(([k, v]) => (
                <View key={k} className="flex-row items-center justify-between">
                  <Text className="text-sm text-zinc-400">{k}</Text>
                  <Text className="text-sm font-medium text-white">{v}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Start button */}
        <View className="px-5 pb-5 pt-1">
          <Pressable
            onPress={() => router.push('/(tabs)/record/recording')}
            className="w-full rounded-2xl bg-emerald-500 py-4 items-center"
          >
            <Text className="text-sm font-semibold text-black">
              Start Session at {selectedCircuit.name}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
