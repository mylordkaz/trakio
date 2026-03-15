import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import StatusPill from '@/components/StatusPill';
import { CIRCUITS } from '@/constants/data';

const FILTERS = ['All', 'Recent', 'Popular', 'Saved'];

export default function CircuitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState(0);
  const [search, setSearch] = useState('');

  const filteredCircuits = CIRCUITS.filter((circuit) => {
    const matchesSearch =
      !search ||
      circuit.name.toLowerCase().includes(search.toLowerCase()) ||
      circuit.country.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 0 ||
      circuit.status === FILTERS[activeFilter];
    return matchesSearch && matchesFilter;
  });

  return (
    <View className="flex-1 bg-zinc-900 overflow-hidden">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['rgba(14,165,233,0.15)', '#18181b', '#18181b']}
          locations={[0, 0.5, 1]}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs text-zinc-400">{i18n.t('circuits.header')}</Text>
            <Text className="text-xs text-zinc-400">{i18n.t('circuits.trackCount', { count: CIRCUITS.length })}</Text>
          </View>

          <View className="mb-5">
            <Text className="text-sm text-zinc-400 mb-1">{i18n.t('circuits.subtitle')}</Text>
            <Text className="text-2xl font-semibold tracking-tight text-white">{i18n.t('circuits.title')}</Text>
          </View>

          <View className="rounded-3xl bg-black/40 border border-white/10 p-3">
            <View className="flex-row items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <Ionicons name="search" size={16} color="#a1a1aa" />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#ffffff', padding: 0 }}
                placeholder={i18n.t('circuits.searchPlaceholder')}
                placeholderTextColor="#a1a1aa"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 12 }}
            >
              {FILTERS.map((filter, index) => (
                <Pressable
                  key={filter}
                  onPress={() => setActiveFilter(index)}
                  className={`rounded-full px-3 py-1.5 border ${
                    activeFilter === index
                      ? 'bg-sky-500 border-sky-400'
                      : 'bg-white/10 border-white/10'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      activeFilter === index ? 'text-black' : 'text-zinc-300'
                    }`}
                  >
                    {filter}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </LinearGradient>

        <View className="px-5 py-4 gap-3">
          {filteredCircuits.map((circuit) => (
            <Pressable
              key={circuit.name}
              onPress={() => router.push({ pathname: '/(tabs)/circuits/detail', params: { name: circuit.name } })}
              className="w-full rounded-3xl bg-white/5 border border-white/10 p-4"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold leading-tight text-white">{circuit.name}</Text>
                  <Text className="text-sm text-zinc-400">{circuit.country}</Text>
                </View>
                <StatusPill text={circuit.status} color="sky" />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1 rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('circuits.length')}</Text>
                  <Text className="text-sm font-medium text-white">{circuit.length}</Text>
                </View>
                <View className="flex-1 rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <Text className="text-xs text-zinc-500 mb-1">{i18n.t('circuits.corners')}</Text>
                  <Text className="text-sm font-medium text-white">{circuit.corners}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <View className="px-5 pb-5 pt-1">
          <Pressable className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 items-center">
            <Text className="text-sm font-medium text-white">{i18n.t('circuits.importCustom')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
