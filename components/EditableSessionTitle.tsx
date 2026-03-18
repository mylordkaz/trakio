import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';

type EditableSessionTitleProps = {
  title: string;
  onChangeTitle: (newTitle: string) => void;
};

export default function EditableSessionTitle({ title, onChangeTitle }: EditableSessionTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<TextInput>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  function handleStartEditing() {
    setDraft(title);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSubmit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      onChangeTitle(trimmed);
    } else {
      setDraft(title);
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <View className="flex-row items-center gap-2">
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSubmit}
          onBlur={handleSubmit}
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white flex-1 p-0"
          style={{ lineHeight: 32 }}
          returnKeyType="done"
          autoFocus
        />
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
        {title}
      </Text>
      <Pressable onPress={handleStartEditing} hitSlop={8}>
        <Ionicons name="pencil" size={16} color={isDark ? '#a1a1aa' : '#71717a'} />
      </Pressable>
    </View>
  );
}
