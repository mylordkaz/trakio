import { useEffect } from 'react';
import { Modal, Pressable, View, Text, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '@/i18n';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useExternalGps } from '@/contexts/ExternalGpsContext';
import type { DeviceClassification, DiscoveredDevice } from '@/telemetry/sources/types';

const PROTOCOL_LABELS: Record<DeviceClassification['protocol'], string> = {
  'racebox-binary': 'RaceBox',
  'qstarz-ble': 'Qstarz',
};

type DeviceScanModalProps = {
  visible: boolean;
  onClose: () => void;
};

function getRssiLabel(rssi: number): string {
  if (rssi >= -60) return '●●●';
  if (rssi >= -75) return '●●○';
  return '●○○';
}

function getRssiColor(rssi: number): string {
  if (rssi >= -60) return '#34d399';
  if (rssi >= -75) return '#fbbf24';
  return '#f87171';
}

export default function DeviceScanModal({ visible, onClose }: DeviceScanModalProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { scanResults, isScanning, startScan, stopScan, selectDevice } = useExternalGps();

  useEffect(() => {
    if (visible) {
      void startScan();
    }
    return () => {
      if (visible) {
        stopScan();
      }
    };
  }, [visible, startScan, stopScan]);

  function handleSelect(device: DiscoveredDevice) {
    selectDevice(device);
    onClose();
  }

  function renderDevice({ item }: { item: DiscoveredDevice }) {
    return (
      <Pressable
        onPress={() => handleSelect(item)}
        className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3.5 mb-2"
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: isDark ? 'rgba(52,211,153,0.1)' : 'rgba(16,185,129,0.1)' }}
        >
          <Ionicons name="navigate" size={20} color="#34d399" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-zinc-900 dark:text-white">
            {item.name}
          </Text>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {PROTOCOL_LABELS[item.classification.protocol]}
          </Text>
        </View>
        <Text style={{ color: getRssiColor(item.rssi), fontSize: 14, letterSpacing: 2 }}>
          {getRssiLabel(item.rssi)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 justify-end"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-zinc-100 dark:bg-zinc-900 px-5 pt-6 pb-10"
          style={{ maxHeight: '60%' }}
        >
          <View className="mb-5 items-center">
            <View className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </View>

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-semibold text-zinc-900 dark:text-white">
              {i18n.t('menu.scanForDevices')}
            </Text>
            {isScanning && <ActivityIndicator size="small" color="#34d399" />}
          </View>

          {isScanning && scanResults.length === 0 && (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#34d399" />
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">
                {i18n.t('menu.scanning')}
              </Text>
            </View>
          )}

          {!isScanning && scanResults.length === 0 && (
            <View className="items-center py-8">
              <Ionicons name="bluetooth-outline" size={32} color={isDark ? '#52525b' : '#a1a1aa'} />
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">
                {i18n.t('menu.noDevicesFound')}
              </Text>
            </View>
          )}

          {scanResults.length > 0 && (
            <>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                {i18n.t('menu.tapToSelect')}
              </Text>
              <FlatList
                data={scanResults}
                keyExtractor={(item) => item.id}
                renderItem={renderDevice}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
