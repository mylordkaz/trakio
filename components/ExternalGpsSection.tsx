import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import i18n from '@/i18n';
import { useExternalGps } from '@/contexts/ExternalGpsContext';
import DeviceScanModal from '@/components/DeviceScanModal';

export default function ExternalGpsSection() {
  const { selectedDevice, clearDevice } = useExternalGps();
  const [scanVisible, setScanVisible] = useState(false);

  return (
    <>
      <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 mb-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-[15px] font-medium text-zinc-900 dark:text-white">
              {i18n.t('menu.externalGpsDevice')}
            </Text>
            {selectedDevice ? (
              <View className="flex-row items-center mt-0.5">
                <View
                  className="h-2 w-2 rounded-full mr-1.5"
                  style={{ backgroundColor: '#34d399' }}
                />
                <Text className="text-sm text-emerald-500 dark:text-emerald-400">
                  {selectedDevice.name}
                </Text>
              </View>
            ) : (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                {i18n.t('menu.noDevicePaired')}
              </Text>
            )}
          </View>
          {selectedDevice && (
            <Pressable
              onPress={clearDevice}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10"
            >
              <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {i18n.t('menu.removeDevice')}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => setScanVisible(true)}
          className="mt-3 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 py-3 items-center"
        >
          <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {i18n.t('menu.scanForDevices')}
          </Text>
        </Pressable>
      </View>

      <DeviceScanModal
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
      />
    </>
  );
}
