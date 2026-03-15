import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import i18n from '@/i18n';
import Card from '@/components/Card';
import LapRow from '@/components/LapRow';
import ProgressBar from '@/components/ProgressBar';
import { LAP_DATA } from '@/constants/data';

const SECTORS = [
  { label: 'S1', time: '32.184', active: true },
  { label: 'S2', time: '41.902', active: false },
  { label: 'S3', time: '34.685', active: false },
];

export default function RecordingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['rgba(239,68,68,0.15)', '#18181b', '#18181b']}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-400">Fuji Speedway</Text>
            <Text className="text-xs text-zinc-400">12:18 PM</Text>
          </View>

          {/* Title + REC badge */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-sm text-zinc-400">Session Recording</Text>
              <Text className="text-2xl font-semibold tracking-tight text-white">Track Day · Session 2</Text>
            </View>
            <View className="flex-row items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 border border-red-400/20">
              <View className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <Text className="text-sm text-red-400">{i18n.t('session.recording')}</Text>
            </View>
          </View>

          {/* Current lap card */}
          <View className="rounded-3xl bg-black/40 border border-white/10 p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm text-zinc-400">{i18n.t('session.currentLap')}</Text>
              <Text className="text-sm text-zinc-400">Lap 5</Text>
            </View>
            <Text
              className="text-white mb-3"
              style={{ fontSize: 56, lineHeight: 56, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            >
              1:12.48
            </Text>
            <View className="flex-row gap-2">
              {SECTORS.map((s) => (
                <View
                  key={s.label}
                  className={`flex-1 rounded-2xl p-3 border ${
                    s.active ? 'bg-red-500/10 border-red-400/30' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <Text className="text-xs text-zinc-400 mb-1">{s.label}</Text>
                  <Text className="text-lg font-medium text-white">{s.time}</Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-4">
          {/* Stats row */}
          <View className="flex-row gap-3">
            {[
              [i18n.t('session.bestLap'), '1:48.771'],
              [i18n.t('session.topSpeed'), '214 km/h'],
              [i18n.t('session.duration'), '18:42'],
            ].map(([l, v]) => (
              <View key={l} className="flex-1 rounded-2xl bg-white/5 border border-white/10 p-3">
                <Text className="text-xs text-zinc-400 mb-1">{l}</Text>
                <Text className="text-lg font-semibold text-white">{v}</Text>
              </View>
            ))}
          </View>

          {/* Live Telemetry */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-sm font-medium text-white">{i18n.t('telemetry.title')}</Text>
                <Text className="text-xs text-zinc-400">{i18n.t('telemetry.subtitle')}</Text>
              </View>
              <Text className="text-sm text-emerald-400">{i18n.t('telemetry.stable')}</Text>
            </View>
            <View className="gap-3">
              <ProgressBar label={i18n.t('telemetry.throttle')} value="78%" />
              <ProgressBar label={i18n.t('telemetry.brake')} value="12%" />
              <ProgressBar label={i18n.t('telemetry.gpsSignal')} value="92%" color="bg-emerald-400" />
            </View>
          </Card>

          {/* Recent Laps */}
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-medium text-white">Recent Laps</Text>
              <Text className="text-xs text-zinc-400">View all</Text>
            </View>
            <View className="gap-2">
              {LAP_DATA.map((item) => (
                <LapRow key={item.lap} item={item} />
              ))}
            </View>
          </Card>
        </View>

        {/* Bottom buttons */}
        <View className="px-5 pb-5 pt-1 flex-row gap-3">
          <Pressable className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-white">{i18n.t('session.markPitIn')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)/record/post-session')}
            className="flex-1 rounded-2xl bg-red-500 py-3.5 items-center"
          >
            <Text className="text-sm font-semibold text-white">{i18n.t('session.end')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
