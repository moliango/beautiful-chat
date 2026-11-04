import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFrostedGlass } from "./components/frosted";
import { usePointerGlow } from "./components/glow";
import { MarkdownView } from "./components/markdown/markdown-view";
import { ReasoningTrace } from "./components/reasoning-trace";
import { useSelectionActions } from "./components/selection-actions";
import { TaskList } from "./components/task-list";
import { ToolCallout } from "./components/tool-callouts";
import { UserMessage } from "./components/user-message";
import { radius, type ExtendedThemeTokens } from "./components/theme-tokens";
import type { EnhancerPreferences } from "./preferences";
import { toolCardStartsExpanded } from "./tool-collapse";
import type { ReasoningTraceData, TaskListData, ToolCalloutData } from "../shared/contracts";

const REASONING: ReasoningTraceData = {
  id: "settings-reasoning",
  agentModel: "",
  durationMs: 0,
  totalTokens: 128,
  status: "completed",
  steps: [{
    id: "read",
    number: 1,
    title: "检查布局",
    status: "completed",
    content: "我会保持文字清晰，并让代码易于阅读。",
  }],
};

const BASH: ToolCalloutData = {
  id: "settings-bash",
  tool: "bash",
  title: "检查类型",
  status: "running",
  command: "npm run typecheck",
  shell: {
    command: "npm run typecheck",
    stdout: "> tsc --noEmit\nChecking source files…",
  },
};

const CHECKLIST: TaskListData = {
  id: "settings-checklist",
  phaseName: "计划",
  tasks: [
    { id: "layout", title: "检查布局", phase: "复查", status: "completed" },
    { id: "types", title: "检查类型", phase: "检查", status: "in_progress" },
  ],
};

const REPLY = [
  "## 准备复查",
  "",
  "`theme` 会遵循你的设置。",
  "",
  "- 清晰文字",
  "- 使用所选字体的代码",
  "",
  "```typescript",
  "const ready = x => x !== null;",
  "```",
].join("\n");

export function SettingsPreview({
  preferences,
  tokens,
}: {
  preferences: EnhancerPreferences;
  tokens: ExtendedThemeTokens;
}) {
  useSelectionActions(tokens, preferences.selectionActions);
  usePointerGlow(preferences.pointerGlow);
  useFrostedGlass(preferences.frostedGlass);
  const textStyle = { color: tokens.foregroundMuted, fontFamily: tokens.fontUi };
  return (
    <View testID="settings-preview" style={[styles.panel, { borderColor: tokens.borderSubtle, backgroundColor: tokens.surface1 }]}>
      <View style={[styles.header, { borderBottomColor: tokens.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.foreground, fontFamily: tokens.fontUi }]}>预览</Text>
        <Text style={[styles.description, textStyle]}>示例对话。更改会立即显示在这里。</Text>
      </View>
      <View style={styles.conversation}>
        {preferences.enhancedUserBubble ? (
          <UserMessage
            text="使用清晰的文字，并让代码易于阅读。"
            tokens={tokens}
            foldAfterLines={preferences.promptFoldLimit}
          />
        ) : (
          <Text style={[styles.note, textStyle]}>Paseo 会使用自己的气泡显示提示词。</Text>
        )}
        <ReasoningTrace
          key={`reasoning-${preferences.collapseReasoning}`}
          data={REASONING}
          tokens={tokens}
          defaultExpanded={!preferences.collapseReasoning}
        />
        <ToolCallout
          key={`tool-${preferences.expandWhileRunning}-${preferences.collapseTools.join(",")}-${preferences.collapseLineLimit}`}
          data={BASH}
          tokens={tokens}
          defaultExpanded={toolCardStartsExpanded(BASH, preferences)}
        />
        <View style={styles.reply}>
          {preferences.assistantMarkdown ? (
            <MarkdownView
              text={REPLY}
              tokens={tokens}
              variant={preferences.markdownVariant}
              foldCodeAfter={preferences.codeFoldLimit}
            />
          ) : (
            <Text style={[styles.note, textStyle]}>Paseo 会显示回复。启用“助手 Markdown”后可预览其样式。</Text>
          )}
        </View>
        <View>
          <Text style={[styles.label, textStyle]}>检查清单</Text>
          <TaskList data={CHECKLIST} tokens={tokens} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: radius.card, overflow: "hidden", minWidth: 0 },
  header: { padding: 16, gap: 4, borderBottomWidth: 1 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  description: { fontSize: 12, lineHeight: 20 },
  conversation: { padding: 16, gap: 8 },
  note: { fontSize: 12, lineHeight: 20, paddingVertical: 8 },
  reply: { paddingVertical: 8 },
  label: { fontSize: 10, lineHeight: 16, fontWeight: "600" },
});
