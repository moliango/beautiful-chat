import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { hostFontEscape } from "./components/host-font-escape";
import {
  radius,
  fontCode,
  fontMono,
  fontUi,
  resolveCodeFonts,
  useThemeTokens,
  type ExtendedThemeTokens,
} from "./components/theme-tokens";
import { SettingsPreview } from "./settings-preview";
import {
  ACCENT_PRESETS,
  TEXT_SIZE_OPTIONS,
  COLLAPSIBLE_TOOL_GROUPS,
  resetEnhancerPreferences,
  updateEnhancerPreferences,
  useEnhancerPreferences,
  useEnhancerPreferencesError,
  BOLD_COLOR_PRESETS,
  MARK_COLOR_PRESETS,
  type AccentPreset,
  type BoldColorPreset,
  type MarkColorPreset,
  type CodeFoldLimit,
  type CodeFontPreference,
  type CollapseLineLimit,
  type CollapsibleToolGroup,
  type LineSpacingPreference,
  type MarkdownVariantPreference,
  type PromptFoldLimit,
  type UiFontPreference,
} from "./preferences";

const ACCENT_OPTIONS: ReadonlyArray<{ id: AccentPreset; label: string }> = [
  { id: "host", label: "Paseo 主题" },
  { id: "jade", label: "翡翠绿" },
  { id: "violet", label: "紫罗兰" },
  { id: "amber", label: "琥珀黄" },
  { id: "rose", label: "玫红" },
];
const MARK_COLOUR_OPTIONS: ReadonlyArray<{ value: MarkColorPreset; label: string; color: string | null }> = [
  { value: "default", label: "默认", color: null },
  { value: "yellow", label: "黄色", color: MARK_COLOR_PRESETS.yellow },
  { value: "green", label: "薄荷绿", color: MARK_COLOR_PRESETS.green },
  { value: "blue", label: "天蓝", color: MARK_COLOR_PRESETS.blue },
  { value: "pink", label: "玫红", color: MARK_COLOR_PRESETS.pink },
  { value: "orange", label: "蜜桃色", color: MARK_COLOR_PRESETS.orange },
];

/** The accent swatch resolves against the live theme, so it is built per render. */
function boldColourOptions(accent: string): ReadonlyArray<{ value: BoldColorPreset; label: string; color: string | null }> {
  return [
    { value: "inherit", label: "继承", color: null },
    { value: "accent", label: "强调色", color: accent },
    { value: "rose", label: "玫红", color: BOLD_COLOR_PRESETS.rose },
    { value: "orange", label: "橙色", color: BOLD_COLOR_PRESETS.orange },
    { value: "green", label: "绿色", color: BOLD_COLOR_PRESETS.green },
    { value: "blue", label: "蓝色", color: BOLD_COLOR_PRESETS.blue },
    { value: "violet", label: "紫罗兰", color: BOLD_COLOR_PRESETS.violet },
  ];
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HUE_STEPS = 24;

/** Converts one hue at the picker's fixed saturation and lightness to hex. */
function hueToHex(hue: number): string {
  const saturation = 0.72;
  const lightness = 0.55;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const v = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const TOOL_GROUP_OPTIONS: ReadonlyArray<{ value: CollapsibleToolGroup; label: string }> = [
  { value: "shell", label: "Shell 与 Git" },
  { value: "write", label: "写入" },
  { value: "edit", label: "编辑" },
  { value: "read", label: "读取" },
  { value: "other", label: "其他工具" },
];
const LINE_LIMIT_OPTIONS: ReadonlyArray<{ value: `${CollapseLineLimit}`; label: string }> = [
  { value: "0", label: "始终" },
  { value: "10", label: "超过 10 行" },
  { value: "20", label: "超过 20 行" },
  { value: "50", label: "超过 50 行" },
];
const CODE_FOLD_OPTIONS: ReadonlyArray<{ value: `${CodeFoldLimit}`; label: string }> = [
  { value: "0", label: "从不" },
  { value: "30", label: "超过 30 行" },
  { value: "60", label: "超过 60 行" },
];
const PROMPT_FOLD_OPTIONS: ReadonlyArray<{ value: `${PromptFoldLimit}`; label: string }> = [
  { value: "0", label: "从不" },
  { value: "15", label: "超过 15 行" },
  { value: "30", label: "超过 30 行" },
];
const LINE_SPACING = { compact: 1, balanced: 1.15, spacious: 1.3 } as const;
const TWO_COLUMN_WIDTH = 860;
const PREVIEW_WIDTH = 380;
const MAX_PAGE_WIDTH = 1200;
/** The host's page padding on both sides. */
const PANE_MARGIN = 32;
const TRACK_WIDTH = 40;
const TRACK_HEIGHT = 24;
const KNOB = 16;

function Chip({ text, tokens }: { text: string; tokens: ExtendedThemeTokens }) {
  return (
    <Text
      style={[
        styles.chip,
        { color: tokens.foregroundMuted, backgroundColor: tokens.surface2, fontFamily: tokens.fontUi },
      ]}
    >
      {text}
    </Text>
  );
}

/**
 * A colour picker built from the runtime's own primitives: a strip of hue
 * steps for quick picks and a hex field for an exact colour. A stepped strip
 * stands in for a gradient, since the plugin sandbox admits no SVG to draw
 * one, and twenty-four steps read as continuous at chip width.
 */
function ColourPicker({ hex, onChange, label, tokens }: { hex: string; onChange(hex: string): void; label: string; tokens: ExtendedThemeTokens }) {
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  const valid = HEX_RE.test(draft);
  const commit = (): void => {
    if (valid) onChange(draft.toLowerCase());
    else setDraft(hex);
  };
  return (
    <View style={styles.picker}>
      <View style={styles.hueStrip}>
        {Array.from({ length: HUE_STEPS }, (_, index) => {
          const hue = Math.round((360 / HUE_STEPS) * index);
          return (
            <Pressable
              key={hue}
              accessibilityRole="button"
              accessibilityLabel={`${label}：色相 ${hue} 度`}
              onPress={() => onChange(hueToHex(hue))}
              style={[styles.hueChip, { backgroundColor: hueToHex(hue) }]}
            />
          );
        })}
      </View>
      <View style={styles.hexRow}>
        <View style={[styles.swatch, { backgroundColor: valid ? draft : tokens.border }]} />
        <TextInput
          accessibilityLabel={`${label}的十六进制色值`}
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="#f5d90a"
          placeholderTextColor={tokens.foregroundSubtle}
          style={[styles.hexInput, { color: tokens.foreground, backgroundColor: tokens.surface2, borderColor: valid ? tokens.borderSubtle : tokens.dangerBorder, fontFamily: tokens.fontMono }]}
        />
      </View>
    </View>
  );
}

/** Colour swatches, with an optional Custom swatch that reveals the picker. */
function SwatchRow<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
  customColor,
  tokens,
}: {
  title: string;
  description: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; color: string | null }>;
  onChange(value: T): void;
  customColor?: { hex: string; onChange(hex: string): void };
  tokens: ExtendedThemeTokens;
}) {
  const allOptions = customColor
    ? [...options, { value: "custom" as T, label: "自定义", color: customColor.hex }]
    : options;
  return (
    <View style={[styles.row, { borderTopColor: tokens.borderSubtle }]}>
      <SettingText title={title} description={description} tokens={tokens} />
      <View style={styles.swatches}>
        {allOptions.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${title}: ${option.label}`}
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.accentOption, {
                borderColor: selected ? tokens.accent : tokens.border,
                backgroundColor: selected ? tokens.accentBg : pressed ? tokens.surface2 : tokens.surface1,
              }]}
            >
              <View style={[styles.swatch, { backgroundColor: option.color ?? tokens.border }]} />
              <Text style={[styles.optionLabel, { color: selected ? tokens.accent : tokens.foreground, fontFamily: tokens.fontUi }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {customColor && value === "custom" ? (
        <ColourPicker hex={customColor.hex} onChange={customColor.onChange} label={title} tokens={tokens} />
      ) : null}
    </View>
  );
}

function SettingText({
  title,
  description,
  chip,
  tokens,
}: {
  title: string;
  description: string;
  chip?: string;
  tokens: ExtendedThemeTokens;
}) {
  return (
    <View style={styles.settingText}>
      <View style={styles.titleRow}>
        <Text style={[styles.rowTitle, { color: tokens.foreground, fontFamily: tokens.fontUi }]}>
          {title}
        </Text>
        {chip ? <Chip text={chip} tokens={tokens} /> : null}
      </View>
      <Text style={[styles.description, { color: tokens.foregroundMuted, fontFamily: tokens.fontUi }]}>
        {description}
      </Text>
    </View>
  );
}

function Toggle({
  value,
  onChange,
  label,
  tokens,
}: {
  value: boolean;
  onChange(next: boolean): void;
  label: string;
  tokens: ExtendedThemeTokens;
}) {
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 140,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [value, position]);

  return (
    <Pressable
      accessibilityRole="switch"
      // React Native Web needs the ARIA attribute as well as accessibilityState.
      aria-checked={value}
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={styles.toggleTarget}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? tokens.accent : tokens.surface2,
            borderColor: value ? tokens.accent : tokens.border,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              backgroundColor: value ? tokens.accentForeground : tokens.foregroundMuted,
              transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_WIDTH - KNOB - 8] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function ToggleRow({
  title,
  description,
  chip,
  value,
  onChange,
  tokens,
}: {
  title: string;
  description: string;
  chip?: string;
  value: boolean;
  onChange(next: boolean): void;
  tokens: ExtendedThemeTokens;
}) {
  return (
    <View style={[styles.row, styles.toggleRow, { borderTopColor: tokens.borderSubtle }]}>
      <SettingText title={title} description={description} chip={chip} tokens={tokens} />
      <Toggle value={value} onChange={onChange} label={title} tokens={tokens} />
    </View>
  );
}

function OptionButton({
  label,
  selected,
  onPress,
  tokens,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  tokens: ExtendedThemeTokens;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.simpleOption,
        {
          backgroundColor: selected ? tokens.accentBg : pressed ? tokens.surface2 : tokens.surface1,
          borderColor: selected ? tokens.accent : tokens.border,
        },
      ]}
    >
      <Text style={[styles.optionLabel, { color: selected ? tokens.accent : tokens.foreground, fontFamily: tokens.fontUi }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChoiceRow<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
  renderPreview,
  disabled = false,
  hint,
  tokens,
}: {
  title: string;
  description: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
  renderPreview?(value: T): React.ReactNode;
  disabled?: boolean;
  hint?: string;
  tokens: ExtendedThemeTokens;
}) {
  return (
    <View style={[styles.row, { borderTopColor: tokens.borderSubtle }, disabled && styles.disabled]}>
      <SettingText title={title} description={description} chip={disabled ? "已禁用" : undefined} tokens={tokens} />
      <View style={styles.options}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${title}: ${option.label}`}
              accessibilityState={{ selected, disabled }}
              aria-pressed={selected}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                renderPreview ? styles.option : styles.simpleOption,
                {
                  backgroundColor: selected ? tokens.accentBg : pressed ? tokens.surface2 : tokens.surface1,
                  borderColor: selected ? tokens.accent : tokens.border,
                },
              ]}
            >
              {renderPreview ? (
                <View pointerEvents="none" aria-hidden style={styles.optionPreview}>
                  {renderPreview(option.value)}
                </View>
              ) : null}
              <Text style={[styles.optionLabel, { color: selected ? tokens.accent : tokens.foreground, fontFamily: tokens.fontUi }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text style={[styles.hint, { color: tokens.foregroundMuted, fontFamily: tokens.fontUi }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Each option changes independently. Keep selected values in the displayed order. */
function MultiChoiceRow<T extends string>({
  title,
  description,
  values,
  options,
  onChange,
  tokens,
}: {
  title: string;
  description: string;
  values: readonly T[];
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(values: T[]): void;
  tokens: ExtendedThemeTokens;
}) {
  return (
    <View style={[styles.row, { borderTopColor: tokens.borderSubtle }]}>
      <SettingText title={title} description={description} tokens={tokens} />
      <View style={styles.options}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <OptionButton
              key={option.value}
              label={option.label}
              selected={selected}
              onPress={() =>
                onChange(
                  options
                    .map((candidate) => candidate.value)
                    .filter((value) =>
                      value === option.value ? !selected : values.includes(value),
                    ),
                )
              }
              tokens={tokens}
            />
          );
        })}
      </View>
    </View>
  );
}

function Section({ title, tokens, children }: { title: string; tokens: ExtendedThemeTokens; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { borderColor: tokens.borderSubtle, backgroundColor: tokens.surface0 }]}>
      <View style={[styles.sectionHeader, { backgroundColor: tokens.surface1 }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.foreground, fontFamily: tokens.fontUi }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** The listed size nearest a saved scale, so an out-of-list value still selects one. */
function textSizeValue(scale: number): (typeof TEXT_SIZE_OPTIONS)[number]["value"] {
  let nearest: (typeof TEXT_SIZE_OPTIONS)[number] = TEXT_SIZE_OPTIONS[1];
  for (const option of TEXT_SIZE_OPTIONS) {
    if (Math.abs(Number(option.value) - scale) < Math.abs(Number(nearest.value) - scale)) nearest = option;
  }
  return nearest.value;
}

/** Paseo mounts this page under the host's Plugin settings. */
export function BeautifulChatSettingsPage({ theme }: PluginSurfaceProps) {
  const preferences = useEnhancerPreferences();
  const storageError = useEnhancerPreferencesError();
  const tokens = useThemeTokens(theme.colors, preferences);
  const [wide, setWide] = useState(false);
  const rootRef = useRef<View>(null);
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  // Paseo caps settings pages at 720 px. Use the scroll pane width on web for two columns.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof ResizeObserver === "undefined") return;
    let pane = (rootRef.current as unknown as HTMLElement | null)?.parentElement ?? null;
    while (pane && !/auto|scroll/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
    if (!pane) return;
    const observed = pane;
    const observer = new ResizeObserver(() => setPaneWidth(observed.clientWidth));
    observer.observe(observed);
    return () => observer.disconnect();
  }, []);
  const preview = (
    <View style={wide ? styles.previewColumn : styles.stackedPreview}>
      <SettingsPreview preferences={preferences} tokens={tokens} />
    </View>
  );

  return (
    <View
      {...hostFontEscape}
      ref={rootRef}
      onLayout={(event) => setWide(event.nativeEvent.layout.width >= TWO_COLUMN_WIDTH)}
      style={[
        styles.container,
        { backgroundColor: tokens.surface0 },
        paneWidth ? { width: Math.min(paneWidth - PANE_MARGIN, MAX_PAGE_WIDTH), alignSelf: "center" } : null,
      ]}
    >
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={[styles.title, { color: tokens.foreground, fontFamily: tokens.fontUi }]}>
          Beautiful Chat
        </Text>
        <Text style={[styles.description, { color: tokens.foregroundMuted, fontFamily: tokens.fontUi }]}>
          更改会自动保存到所选主机，并应用于该主机的所有客户端。重新加载聊天后，屏幕上已有的内容才会更新。
        </Text>
        {storageError ? (
          <Text accessibilityRole="alert" style={[styles.description, { color: tokens.danger, fontFamily: tokens.fontUi }]}>
            偏好设置无法保存或加载：{storageError} 请重新修改设置以重试。
          </Text>
        ) : null}
      </View>
      <View style={[styles.columns, wide && styles.wideColumns]}>
        {!wide ? preview : null}
        <View style={[styles.settingsColumn, wide && styles.flexColumn]}>
          <Section title="外观" tokens={tokens}>
            <SwatchRow<AccentPreset>
              title="强调色"
              description="跟随 Paseo 主题、选择预设颜色，或自定义混合颜色。"
              value={preferences.accent}
              options={ACCENT_OPTIONS.map((option) => ({
                value: option.id,
                label: option.label,
                color: option.id === "custom" ? null : (ACCENT_PRESETS[option.id] ?? theme.colors.accent),
              }))}
              customColor={{
                hex: preferences.accentCustomColor,
                onChange: (accentCustomColor) => updateEnhancerPreferences({ accentCustomColor }),
              }}
              onChange={(accent) => updateEnhancerPreferences({ accent })}
              tokens={tokens}
            />
            <ToggleRow
              title="使用 Paseo 字体"
              description="使用 Paseo 外观设置中的字体和代码字号。字体设置留空时，仍使用下方选择。"
              chip="桌面端与网页端"
              value={preferences.hostFonts}
              onChange={(hostFonts) => updateEnhancerPreferences({ hostFonts })}
              tokens={tokens}
            />
            <ChoiceRow<UiFontPreference>
              title="界面字体"
              description="选择提示词和卡片文字使用的字体。"
              value={preferences.uiFont}
              options={[{ value: "inter", label: "Inter" }, { value: "system", label: "系统" }]}
              renderPreview={(value) => <Text style={[styles.fontSample, { color: tokens.foreground, fontFamily: value === "inter" ? fontUi : "System" }]}>Aa</Text>}
              hint={preferences.hostFonts ? "已设置 Paseo 界面字体时，将优先使用 Paseo 的字体。" : undefined}
              onChange={(uiFont) => updateEnhancerPreferences({ uiFont })}
              tokens={tokens}
            />
            <ChoiceRow<CodeFontPreference>
              title="代码字体"
              description="用于代码、差异、终端输出及其他等宽内容的字体。连字仅会在代码块中组合代码符号；原样模式会分别显示每个符号；自定义模式可使用任意已安装的字体族。"
              value={preferences.codeFont}
              options={[{ value: "code", label: "连字" }, { value: "plain", label: "原样" }, { value: "custom", label: "自定义" }]}
              renderPreview={(value) => (
                <Text
                  style={[
                    styles.codeSample,
                    {
                      color: tokens.foreground,
                      fontFamily:
                        value === "custom"
                          ? resolveCodeFonts({ ...preferences, codeFont: "custom", hostFonts: false }).code
                          : value === "code"
                            ? fontCode
                            : fontMono,
                    },
                  ]}
                >
                  {"=> !== <="}
                </Text>
              )}
              hint={
                preferences.hostFonts && preferences.codeFont !== "custom"
                  ? "已设置 Paseo 代码字体时，将优先使用 Paseo 的字体；自定义字体的优先级更高。"
                  : undefined
              }
              onChange={(codeFont) => updateEnhancerPreferences({ codeFont })}
              tokens={tokens}
            />
            {preferences.codeFont === "custom" ? (
              <TextInput
                accessibilityLabel="自定义代码字体族"
                value={preferences.customCodeFont}
                onChangeText={(customCodeFont) => updateEnhancerPreferences({ customCodeFont })}
                placeholder="JetBrains Mono"
                placeholderTextColor={tokens.foregroundSubtle}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                style={[
                  styles.fontInput,
                  {
                    color: tokens.foreground,
                    backgroundColor: tokens.surface2,
                    borderColor: tokens.borderSubtle,
                    fontFamily: tokens.fontCode,
                  },
                ]}
              />
            ) : null}
            <ChoiceRow<(typeof TEXT_SIZE_OPTIONS)[number]["value"]>
              title="文字大小"
              description="缩放插件绘制的文字，包括回复、代码、提示卡和徽标。"
              value={textSizeValue(preferences.textScale)}
              options={TEXT_SIZE_OPTIONS}
              onChange={(textScale) => updateEnhancerPreferences({ textScale: Number(textScale) })}
              tokens={tokens}
            />
            <ChoiceRow<LineSpacingPreference>
              title="行距"
              description="紧凑保持原始间距；均衡增加 15%；宽松增加 30%。"
              value={preferences.lineSpacing}
              options={[{ value: "compact", label: "紧凑" }, { value: "balanced", label: "均衡" }, { value: "spacious", label: "宽松" }]}
              renderPreview={(value) => (
                <View style={styles.spacingSample}>
                  {[0, 1, 2].map((line) => (
                    <View
                      key={line}
                      style={[
                        styles.sampleLine,
                        { backgroundColor: tokens.foregroundMuted, marginVertical: (18 * LINE_SPACING[value] - 4) / 2 },
                        line === 2 && styles.shortLine,
                      ]}
                    />
                  ))}
                </View>
              )}
              onChange={(lineSpacing) => updateEnhancerPreferences({ lineSpacing })}
              tokens={tokens}
            />
            <ToggleRow
              title="毛玻璃"
              description="在支持的环境中模糊卡片背景。关闭后使用纯色表面。"
              value={preferences.frostedGlass}
              onChange={(frostedGlass) => updateEnhancerPreferences({ frostedGlass })}
              tokens={tokens}
            />
            <ToggleRow
              title="指针光晕"
              description="在指针经过卡片时显示柔和光效。启用“减少动态效果”时会禁用此效果。"
              chip="桌面端与网页端"
              value={preferences.pointerGlow}
              onChange={(pointerGlow) => updateEnhancerPreferences({ pointerGlow })}
              tokens={tokens}
            />
          </Section>

          <Section title="回复" tokens={tokens}>
            <ToggleRow
              title="助手 Markdown"
              description="为标题、列表、代码和图片应用样式。关闭后将改用 Mermaid 图表和 Paseo 的文件路径链接。在 iOS 上，样式化回复无法通过拖动选中；请使用“复制”，或关闭此设置。"
              value={preferences.assistantMarkdown}
              onChange={(assistantMarkdown) => updateEnhancerPreferences({ assistantMarkdown })}
              tokens={tokens}
            />
            <ChoiceRow<MarkdownVariantPreference>
              title="Markdown 样式"
              description="选择更宽松、更紧凑的排版，或使用代码字体。"
              value={preferences.markdownVariant}
              disabled={!preferences.assistantMarkdown}
              hint={!preferences.assistantMarkdown ? "启用“助手 Markdown”后可更改样式。" : undefined}
              options={[{ value: "document", label: "文档" }, { value: "compact", label: "紧凑" }, { value: "terminal", label: "终端" }]}
              renderPreview={(value) => (
                <View style={[styles.markdownSample, { gap: value === "document" ? 8 : 4 }]}>
                  <Text style={[styles.sampleHeading, { color: tokens.foreground, fontFamily: value === "terminal" ? tokens.fontMono : tokens.fontUi, fontSize: value === "document" ? 16 : 12 }]}>
                    {value === "terminal" ? "# 标题" : "标题"}
                  </Text>
                  <Text style={[styles.sampleBody, { color: tokens.foregroundMuted, fontFamily: value === "terminal" ? tokens.fontMono : tokens.fontUi, lineHeight: value === "document" ? 20 : 16 }]}>{"第一行\n下一行"}</Text>
                </View>
              )}
              onChange={(markdownVariant) => updateEnhancerPreferences({ markdownVariant })}
              tokens={tokens}
            />
            <ToggleRow
              title="高亮标记"
              description="将回复中的 ==文字== 显示为荧光笔高亮。关闭后将保留输入时的等号。"
              value={preferences.markSyntax}
              onChange={(markSyntax) => updateEnhancerPreferences({ markSyntax })}
              tokens={tokens}
            />
            {preferences.markSyntax ? (
              <SwatchRow<MarkColorPreset>
                title="标记颜色"
                description="选择高亮文字背后的底色。"
                value={preferences.markColor}
                options={MARK_COLOUR_OPTIONS}
                customColor={{
                  hex: preferences.markCustomColor,
                  onChange: (markCustomColor) => updateEnhancerPreferences({ markCustomColor }),
                }}
                onChange={(markColor) => updateEnhancerPreferences({ markColor })}
                tokens={tokens}
              />
            ) : null}
            <SwatchRow<BoldColorPreset>
              title="粗体颜色"
              description="选择回复中粗体文字的颜色。“继承”会沿用周围文字的颜色。"
              value={preferences.boldColor}
              options={boldColourOptions(tokens.accent)}
              customColor={{
                hex: preferences.boldCustomColor,
                onChange: (boldCustomColor) => updateEnhancerPreferences({ boldCustomColor }),
              }}
              onChange={(boldColor) => updateEnhancerPreferences({ boldColor })}
              tokens={tokens}
            />
            <ChoiceRow<`${CodeFoldLimit}`>
              title="长代码块"
              description="超过限制的回复代码块会折叠为前 10 行；“复制”仍会复制完整代码块。开启“全部默认折叠”时，代码块会完全收起。"
              value={`${preferences.codeFoldLimit}`}
              options={CODE_FOLD_OPTIONS}
              onChange={(value) => updateEnhancerPreferences({ codeFoldLimit: Number(value) as CodeFoldLimit })}
              tokens={tokens}
            />
          </Section>

          <Section title="提示词" tokens={tokens}>
            <ToggleRow
              title="增强提示词气泡"
              description="Paseo 会在插件收到提示词前移除粘贴的图片。若要使用 Paseo 带图片的气泡，请关闭此设置。在 iOS 上，该气泡无法通过拖动选中；请使用“复制”，或关闭此设置。"
              value={preferences.enhancedUserBubble}
              onChange={(enhancedUserBubble) => updateEnhancerPreferences({ enhancedUserBubble })}
              tokens={tokens}
            />
            <ChoiceRow<`${PromptFoldLimit}`>
              title="长提示词"
              description="将长提示词折叠为前 8 行，但“复制”仍会保留完整文字。Paseo 自带的气泡不会折叠。"
              value={`${preferences.promptFoldLimit}`}
              options={PROMPT_FOLD_OPTIONS}
              onChange={(value) => updateEnhancerPreferences({ promptFoldLimit: Number(value) as PromptFoldLimit })}
              tokens={tokens}
            />
          </Section>

          <Section title="时间线" tokens={tokens}>
            <ToggleRow
              title="全部默认折叠"
              description="开启后，插件绘制的所有工具卡片和回复代码块一出现就只显示标题；点击工具标题或代码块的“显示全部”即可展开。此开关优先于下方折叠规则。"
              value={preferences.foldAllByDefault}
              onChange={(foldAllByDefault) => updateEnhancerPreferences({ foldAllByDefault })}
              tokens={tokens}
            />
            <MultiChoiceRow<CollapsibleToolGroup>
              title="完成后折叠"
              description="所选工具组完成后自动折叠。失败的调用和智能体提问会保持展开，每个标题仍可打开或关闭对应卡片。"
              values={preferences.collapseTools}
              options={TOOL_GROUP_OPTIONS}
              onChange={(values) => updateEnhancerPreferences({ collapseTools: COLLAPSIBLE_TOOL_GROUPS.filter((group) => values.includes(group)) })}
              tokens={tokens}
            />
            <ChoiceRow<`${CollapseLineLimit}`>
              title="折叠长度"
              description="折叠所有选中的卡片，或仅折叠超过限制的卡片。设置行数限制后，较短的结果会保持展开。"
              value={`${preferences.collapseLineLimit}`}
              options={LINE_LIMIT_OPTIONS}
              onChange={(value) => updateEnhancerPreferences({ collapseLineLimit: Number(value) as CollapseLineLimit })}
              tokens={tokens}
            />
            <ToggleRow
              title="运行时展开"
              description="工具调用运行期间展开对应卡片，结束后再应用上述规则。关闭后，将从一开始就应用上述规则。"
              value={preferences.expandWhileRunning}
              onChange={(expandWhileRunning) => updateEnhancerPreferences({ expandWhileRunning })}
              tokens={tokens}
            />
            <ToggleRow
              title="允许 Paseo 折叠工具调用"
              description="当 Paseo 的聊天显示折叠工具调用时，由 Paseo 绘制这些调用。"
              chip="桌面端与网页端"
              value={preferences.paseoToolFolding}
              onChange={(paseoToolFolding) => updateEnhancerPreferences({ paseoToolFolding })}
              tokens={tokens}
            />
            {preferences.paseoToolFolding && (
              <ToggleRow
                title="在折叠调用之间显示推理"
                description="关闭后，仅在 Paseo 折叠工具调用期间隐藏推理。"
                value={preferences.overviewReasoning}
                onChange={(overviewReasoning) => updateEnhancerPreferences({ overviewReasoning })}
                tokens={tokens}
              />
            )}
            <ToggleRow
              title="折叠推理摘要"
              description="推理摘要出现时默认折叠，点击标题可随时展开。关闭此设置可让所有摘要默认展开。"
              value={preferences.collapseReasoning}
              onChange={(collapseReasoning) => updateEnhancerPreferences({ collapseReasoning })}
              tokens={tokens}
            />
            <ToggleRow
              title="实时检查清单"
              description="仅显示信息流标记为当前状态的检查清单更新。信息流不可用时，卡片会保持可见。关闭此设置可显示每次更新。"
              value={preferences.liveChecklist}
              onChange={(liveChecklist) => updateEnhancerPreferences({ liveChecklist })}
              tokens={tokens}
            />
          </Section>

          <Section title="交互" tokens={tokens}>
            <ToggleRow
              title="选中操作"
              description="选中文字后显示“复制”和“添加到聊天”。“添加到聊天”会将所选内容作为引用或代码块插入。"
              chip="桌面端与网页端"
              value={preferences.selectionActions}
              onChange={(selectionActions) => updateEnhancerPreferences({ selectionActions })}
              tokens={tokens}
            />
            <ToggleRow
              title="打开文件前确认"
              description="在运行 Paseo 守护进程的电脑上打开安全文件前进行确认。其他文件以及工作目录之外的路径始终需要确认。"
              chip="桌面端与网页端"
              value={preferences.confirmOpenPath}
              onChange={(confirmOpenPath) => updateEnhancerPreferences({ confirmOpenPath })}
              tokens={tokens}
            />
          </Section>
          <Pressable
            accessibilityRole="button"
            onPress={resetEnhancerPreferences}
            style={({ pressed }) => [styles.reset, { borderColor: tokens.border, backgroundColor: pressed ? tokens.surface2 : tokens.surface1 }]}
          >
            <Text style={[styles.optionLabel, { color: tokens.foreground, fontFamily: tokens.fontUi }]}>恢复默认设置</Text>
          </Pressable>
        </View>
        {wide ? preview : null}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  // The host uses a content-sized column. A zero flex basis collapses this page.
  container: { alignSelf: "stretch", padding: 16, gap: 24 },
  intro: { gap: 8 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "700" },
  description: { fontSize: 12, lineHeight: 20 },
  columns: { gap: 24, alignItems: "stretch" },
  wideColumns: { flexDirection: "row", alignItems: "flex-start" },
  settingsColumn: { minWidth: 0, gap: 16 },
  flexColumn: { flex: 1 },
  previewColumn: {
    width: PREVIEW_WIDTH,
    flexShrink: 0,
    // Keep the preview in view while the settings scroll.
    ...(Platform.OS === "web" ? ({ position: "sticky", top: 16 } as unknown as object) : null),
  },
  stackedPreview: { alignSelf: "stretch", minWidth: 0 },
  card: { borderWidth: 1, borderRadius: radius.card, overflow: "hidden" },
  sectionHeader: { padding: 16 },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  row: { padding: 16, gap: 12, borderTopWidth: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  settingText: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  chip: { fontSize: 10, lineHeight: 16, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.chip },
  toggleTarget: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  track: { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, borderWidth: 1, padding: 3, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { flex: 1, minWidth: 88, borderWidth: 1, borderRadius: radius.block, padding: 12, gap: 8 },
  simpleOption: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: radius.block, paddingHorizontal: 12, paddingVertical: 8 },
  optionPreview: { height: 72, justifyContent: "center" },
  optionLabel: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  fontSample: { fontSize: 28, lineHeight: 36 },
  codeSample: { fontSize: 16, lineHeight: 24 },
  fontInput: { minHeight: 44, borderWidth: 1, borderRadius: radius.block, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  spacingSample: { width: "100%", maxWidth: 72 },
  sampleLine: { width: "100%", height: 4, borderRadius: radius.chip },
  shortLine: { width: "64%" },
  markdownSample: { alignSelf: "stretch" },
  sampleHeading: { fontWeight: "700" },
  sampleBody: { fontSize: 10 },
  hint: { fontSize: 12, lineHeight: 20 },
  disabled: { opacity: 0.5 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  accentOption: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8, borderWidth: 1, borderRadius: radius.block, paddingHorizontal: 12, paddingVertical: 8 },
  swatch: { width: 16, height: 16, borderRadius: radius.chip },
  picker: { gap: 8 },
  hueStrip: { flexDirection: "row", gap: 1 },
  hueChip: { flex: 1, height: 24, borderRadius: 2 },
  hexRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hexInput: { minHeight: 44, width: 120, borderWidth: 1, borderRadius: radius.block, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  reset: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: radius.block, paddingHorizontal: 16, paddingVertical: 12 },
});
