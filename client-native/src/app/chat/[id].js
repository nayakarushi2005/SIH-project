import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, SendHorizontal } from 'lucide-react-native';

import ContactAvatar from '../../components/ContactAvatar';
import EmptyState from '../../components/EmptyState';
import { radius, spacing, typography } from '../../constants/theme';
import { makeStyles, useTheme } from '../../hooks/useTheme';
import { formatChatTime, markRead, sendMessage, useChat } from '../../services/chatStore';

function Bubble({ message }) {
  const styles = useStyles();
  const mine = message.fromMe;
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
        <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatChatTime(message.at)}</Text>
      </View>
    </View>
  );
}

export default function Chat() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const chat = useChat(id);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (chat?.unread) markRead(chat.id);
  }, [chat?.id, chat?.unread]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/messages');
  };

  const send = () => {
    if (!chat || !draft.trim()) return;
    sendMessage(chat.id, draft);
    setDraft('');
  };

  if (!chat) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <EmptyState icon="chatbubble-ellipses-outline" title="Chat not found" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={spacing.sm} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <ContactAvatar name={chat.name} photo={chat.photo} color={chat.color} size={40} />
        <Text style={styles.headerName} numberOfLines={1} accessibilityRole="header">
          {chat.name}
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.body} behavior="padding">
        <FlatList
          data={[...chat.messages].reverse()}
          keyExtractor={(message) => message.id}
          renderItem={({ item }) => <Bubble message={item} />}
          inverted
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            accessibilityLabel={`Message ${chat.name}`}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            style={({ pressed }) => [styles.send, !draft.trim() && styles.sendDisabled, pressed && styles.sendPressed]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <SendHorizontal size={22} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerName: {
    ...typography.button,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  messages: {
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.md,
    gap: spacing.xs + 2,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs + 2,
    borderRadius: radius.lg,
    boxShadow: colors.shadowBubble,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    ...typography.body,
    fontSize: 15,
    color: colors.text,
  },
  bubbleTextMine: {
    color: colors.textOnPrimary,
  },
  bubbleTime: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  bubbleTimeMine: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  input: {
    ...typography.body,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    backgroundColor: colors.background,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendPressed: {
    transform: [{ scale: 0.92 }],
  },
}));
