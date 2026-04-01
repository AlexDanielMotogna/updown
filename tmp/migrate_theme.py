import re
import os
import sys

BASE = "C:/Users/Lian Li/UpDown/apps/web/src"

CONST_COLORS = ['UP_COLOR', 'DOWN_COLOR', 'GAIN_COLOR', 'ACCENT_COLOR', 'DRAW_COLOR']

files = [
    "components/profile/PoolsBetTable.tsx",
    "components/profile/ProfileHeader.tsx",
    "components/profile/TournamentPrizes.tsx",
    "components/LeaderboardTable.tsx",
    "components/leaderboard/LeaderboardRow.tsx",
    "components/squad/CreateSquadDialog.tsx",
    "components/squad/CreateSquadPoolForm.tsx",
    "components/squad/SquadCard.tsx",
    "components/squad/SquadChat.tsx",
    "components/squad/SquadLeaderboard.tsx",
    "components/squad/SquadMemberList.tsx",
    "components/referral/EarningsTab.tsx",
    "components/referral/PayoutsTab.tsx",
    "components/referral/ReferralShareLink.tsx",
    "components/referral/ReferralStatsCards.tsx",
    "components/referral/ReferralTab.tsx",
    "components/ConnectWalletButton.tsx",
    "components/Countdown.tsx",
    "components/OddsDisplay.tsx",
    "components/OrderbookDepth.tsx",
    "components/MarketIntelligence.tsx",
    "components/PriceChartDialog.tsx",
    "components/SlotPrice.tsx",
    "components/RewardPopup.tsx",
    "components/UpCoinsBalance.tsx",
    "components/UserLevelBadge.tsx",
    "components/UserProfilePanel.tsx",
    "components/XpProgressBar.tsx",
    "components/ReferralBanner.tsx",
    "components/ReferralDashboard.tsx",
    "components/ReferralDialog.tsx",
    "components/AiAnalyzerBot.tsx",
    "components/ai-bot/BotAvatar.tsx",
    "components/ai-bot/ChatMessage.tsx",
    "components/ai-bot/SignalCard.tsx",
    "components/ai-bot/TypingIndicator.tsx",
    "components/chart/CandlesChart.tsx",
    "components/chart/ChartAxes.tsx",
    "components/chart/LineChart.tsx",
    "components/pool/InlineChart.tsx",
    "components/pool/OddsChart.tsx",
    "components/sidebar/PoolsSidebarList.tsx",
    "components/BetCardSkeleton.tsx",
    "components/PoolCardSkeleton.tsx",
    "components/PoolDetailSkeleton.tsx",
]

hex_alpha_map = {
    '08': 0.03, '10': 0.06, '11': 0.07, '12': 0.07, '15': 0.08, '18': 0.09,
    '20': 0.13, '22': 0.13, '25': 0.15, '30': 0.19, '40': 0.25, '44': 0.27,
    '50': 0.31, '60': 0.38, '80': 0.50, '88': 0.53,
    '4D': 0.30, 'CC': 0.80, 'DD': 0.87,
}

def process_file(relpath):
    filepath = os.path.join(BASE, relpath)
    if not os.path.exists(filepath):
        print(f"SKIP (not found): {relpath}")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'useThemeTokens' in content:
        print(f"SKIP (already migrated): {relpath}")
        return

    if 'extends Component' in content:
        print(f"SKIP (class component): {relpath}")
        return

    original = content
    needs_withAlpha = False

    # Check if withAlpha will be needed
    if (re.search(r'`\$\{[A-Za-z_]+\}[0-9a-fA-F]{2}`', content) or
        re.search(r'`\$\{[A-Za-z_]+\}[0-9a-fA-F]{2}[^`]', content)):
        needs_withAlpha = True

    # ─── Add imports ───
    import_lines = list(re.finditer(r"^import .+$", content, re.MULTILINE))
    if import_lines:
        last_import = import_lines[-1]
        insert_pos = last_import.end()
        new_import = "\nimport { useThemeTokens } from '@/app/providers';"
        if needs_withAlpha:
            new_import += "\nimport { withAlpha } from '@/lib/theme';"
        content = content[:insert_pos] + new_import + content[insert_pos:]

    # ─── Add const t = useThemeTokens(); ───
    func_pattern = re.compile(r'(export\s+function\s+\w+\s*\([^)]*\)\s*\{)', re.DOTALL)
    matches = list(func_pattern.finditer(content))
    inner_func_pattern = re.compile(r'(function\s+[A-Z]\w+\s*\([^)]*\)\s*\{)')
    inner_matches = list(inner_func_pattern.finditer(content))

    all_positions = set()
    for m in matches + inner_matches:
        pos = m.end()
        next_chunk = content[pos:pos+200]
        if 'useThemeTokens' not in next_chunk:
            all_positions.add(pos)

    for pos in sorted(all_positions, reverse=True):
        content = content[:pos] + "\n  const t = useThemeTokens();" + content[pos:]

    # ─── Replace colors ───
    # Backgrounds
    content = content.replace("'#0B0F14'", "t.bg.app")
    content = content.replace("'#0D1219'", "t.bg.surfaceAlt")
    content = content.replace("'#111820'", "t.bg.surface")
    content = content.replace("'#0A0E14'", "t.bg.dialog")
    content = content.replace("'#1a1f2e'", "t.bg.tooltip")
    content = content.replace("'#1a2030'", "t.bg.chart")
    content = content.replace("'#1a1a2e'", "t.bg.tooltip")

    # Semantic colors
    content = content.replace('GAIN_COLOR', 't.gain')
    content = content.replace('UP_COLOR', 't.up')
    content = content.replace('DOWN_COLOR', 't.down')
    content = content.replace('ACCENT_COLOR', 't.accent')
    content = content.replace('DRAW_COLOR', 't.draw')

    # Feature colors
    content = content.replace("'#A78BFA'", "t.prediction")
    content = content.replace("'#60A5FA'", "t.info")
    content = content.replace("'#818CF8'", "t.predict")
    content = content.replace("'#FFD700'", "t.gold")
    content = content.replace("'#C0C0C0'", "t.silver")
    content = content.replace("'#CD7F32'", "t.bronze")
    content = content.replace("'#FBBF24'", "t.draw")
    content = content.replace("'#22C55E'", "t.gain")
    content = content.replace("'#EF4444'", "t.error")
    content = content.replace("'#F59E0B'", "t.accent")
    content = content.replace("'#F472B6'", "t.categoryColors.culture")
    content = content.replace("'#34D399'", "t.categoryColors.finance")
    content = content.replace("'#FB923C'", "t.allocationColors.marketing")
    content = content.replace("'#F43F5E'", "t.logColors.error")
    content = content.replace("'#E879F9'", "t.allocationColors.advisors")
    content = content.replace("'#FACC15'", "t.levelTiers[9]")
    content = content.replace("'#F87171'", "t.down")

    # Text colors
    content = content.replace("color: '#fff'", "color: t.text.primary")
    content = content.replace("color: '#FFFFFF'", "color: t.text.primary")
    content = content.replace("color: '#000'", "color: t.text.contrast")
    content = content.replace("color: '#fff',", "color: t.text.primary,")
    content = content.replace("color: '#000',", "color: t.text.contrast,")
    content = content.replace("fill=\"#000\"", "fill={t.text.contrast}")
    content = content.replace("fill=\"#FFFFFF\"", "fill={t.text.primary}")

    # rgba text (single quotes)
    content = content.replace("'rgba(255,255,255,0.85)'", "t.text.vivid")
    content = content.replace("'rgba(255,255,255,0.75)'", "t.text.bright")
    content = content.replace("'rgba(255,255,255,0.7)'", "t.text.bright")
    content = content.replace("'rgba(255,255,255,0.65)'", "t.text.rich")
    content = content.replace("'rgba(255,255,255,0.6)'", "t.text.strong")
    content = content.replace("'rgba(255,255,255,0.55)'", "t.text.strong")
    content = content.replace("'rgba(255,255,255,0.5)'", "t.text.secondary")
    content = content.replace("'rgba(255,255,255,0.45)'", "t.text.soft")
    content = content.replace("'rgba(255,255,255,0.4)'", "t.text.tertiary")
    content = content.replace("'rgba(255,255,255,0.35)'", "t.text.quaternary")
    content = content.replace("'rgba(255,255,255,0.3)'", "t.text.dimmed")
    content = content.replace("'rgba(255,255,255,0.25)'", "t.text.muted")
    content = content.replace("'rgba(255,255,255,0.2)'", "t.text.muted")
    content = content.replace("'rgba(255,255,255,0.15)'", "t.border.emphasis")
    content = content.replace("'rgba(255,255,255,0.1)'", "t.border.strong")
    content = content.replace("'rgba(255,255,255,0.08)'", "t.border.medium")
    content = content.replace("'rgba(255,255,255,0.06)'", "t.border.default")
    content = content.replace("'rgba(255,255,255,0.04)'", "t.border.subtle")
    content = content.replace("'rgba(255,255,255,0.03)'", "t.hover.light")
    content = content.replace("'rgba(255,255,255,0.02)'", "t.hover.subtle")

    # SVG fill/stroke rgba (double quotes)
    content = content.replace('"rgba(255,255,255,0.5)"', '{t.text.secondary}')
    content = content.replace('"rgba(255,255,255,0.4)"', '{t.text.tertiary}')
    content = content.replace('"rgba(255,255,255,0.3)"', '{t.text.dimmed}')
    content = content.replace('"rgba(255,255,255,0.25)"', '{t.text.muted}')
    content = content.replace('"rgba(255,255,255,0.2)"', '{t.text.muted}')
    content = content.replace('"rgba(255,255,255,0.15)"', '{t.border.emphasis}')
    content = content.replace('"rgba(255,255,255,0.1)"', '{t.border.strong}')
    content = content.replace('"rgba(255,255,255,0.08)"', '{t.border.medium}')
    content = content.replace('"rgba(255,255,255,0.06)"', '{t.border.default}')
    content = content.replace('"rgba(255,255,255,0.04)"', '{t.border.subtle}')

    # Shadows
    content = content.replace("'rgba(0,0,0,0.5)'", "t.shadow.default")
    content = content.replace("'rgba(0,0,0,0.6)'", "t.shadow.deep")
    content = content.replace("'rgba(0,0,0,0.4)'", "t.shadow.light")

    # Hover backgrounds (with spaces)
    content = content.replace("'rgba(255, 255, 255, 0.04)'", "t.hover.default")
    content = content.replace("'rgba(255, 255, 255, 0.05)'", "t.hover.medium")
    content = content.replace("'rgba(255, 255, 255, 0.06)'", "t.hover.medium")
    content = content.replace("'rgba(255, 255, 255, 0.08)'", "t.hover.strong")
    content = content.replace("'rgba(255, 255, 255, 0.1)'", "t.hover.emphasis")
    content = content.replace("'rgba(255, 255, 255, 0.12)'", "t.border.emphasis")
    content = content.replace("'rgba(255, 255, 255, 0.15)'", "t.border.emphasis")
    content = content.replace("'rgba(255, 255, 255, 0.2)'", "t.border.hover")
    content = content.replace("'rgba(255, 255, 255, 0.25)'", "t.text.muted")
    content = content.replace("'rgba(255, 255, 255, 0.3)'", "t.text.dimmed")
    content = content.replace("'rgba(255, 255, 255, 0.5)'", "t.text.secondary")
    content = content.replace("'rgba(255, 255, 255, 0.02)'", "t.hover.subtle")
    content = content.replace("'rgba(255, 255, 255, 0.03)'", "t.hover.light")

    # Borders (full strings)
    content = content.replace("'1px solid rgba(255,255,255,0.04)'", "`1px solid ${t.border.subtle}`")
    content = content.replace("'1px solid rgba(255,255,255,0.06)'", "`1px solid ${t.border.default}`")
    content = content.replace("'1px solid rgba(255,255,255,0.08)'", "`1px solid ${t.border.medium}`")
    content = content.replace("'1px solid rgba(255,255,255,0.1)'", "`1px solid ${t.border.strong}`")
    content = content.replace("'1px solid rgba(255, 255, 255, 0.04)'", "`1px solid ${t.border.subtle}`")
    content = content.replace("'1px solid rgba(255, 255, 255, 0.06)'", "`1px solid ${t.border.default}`")
    content = content.replace("'1px solid rgba(255, 255, 255, 0.08)'", "`1px solid ${t.border.medium}`")
    content = content.replace("'1.5px solid rgba(255,255,255,0.06)'", "`1.5px solid ${t.border.default}`")
    content = content.replace("'1.5px solid rgba(255,255,255,0.1)'", "`1.5px solid ${t.border.strong}`")

    # Specific error bg pattern
    content = content.replace("'rgba(248,113,113,0.1)'", "withAlpha(t.down, 0.1)")
    content = content.replace("'rgba(248,113,113,0.1)'", "withAlpha(t.down, 0.1)")
    content = content.replace("'rgba(59,130,246,0.12)'", "withAlpha(t.info, 0.12)")

    # Fix module-level const issues
    content = re.sub(r"\nconst CYAN = t\.up;\n", "\n", content)

    # Fix MEDAL_COLORS at module level - it was ['#FFD700', '#C0C0C0', '#CD7F32']
    # which became [t.gold, t.silver, t.bronze] at module level (invalid)
    # We need to handle this: keep the original values or move inside component
    if "const MEDAL_COLORS = [t.gold, t.silver, t.bronze];" in content:
        content = content.replace("const MEDAL_COLORS = [t.gold, t.silver, t.bronze];", "")

    # Fix ${t.xxx}HH patterns to withAlpha
    for hexval, decimal in hex_alpha_map.items():
        pattern = re.compile(r'`\$\{(t\.[a-zA-Z_.[\]0-9]+)\}' + hexval + '`')
        if pattern.search(content):
            content = pattern.sub(f'withAlpha(\\1, {decimal})', content)
            needs_withAlpha = True

    # Fix inline template patterns like `0 0 20px ${t.xxx}22`
    for hexval, decimal in hex_alpha_map.items():
        pattern = re.compile(r'\$\{(t\.[a-zA-Z_.[\]0-9]+)\}' + hexval + r'(?=[^0-9a-fA-F`])')
        if pattern.search(content):
            content = pattern.sub(f'${{withAlpha(\\1, {decimal})}}', content)
            needs_withAlpha = True

    # Add withAlpha import if needed
    if needs_withAlpha and "withAlpha" not in content:
        content = content.replace(
            "import { useThemeTokens } from '@/app/providers';",
            "import { useThemeTokens } from '@/app/providers';\nimport { withAlpha } from '@/lib/theme';"
        )

    # Remove duplicate withAlpha imports
    lines = content.split('\n')
    seen_withAlpha = False
    new_lines = []
    for line in lines:
        if "import { withAlpha }" in line:
            if seen_withAlpha:
                continue
            seen_withAlpha = True
        new_lines.append(line)
    content = '\n'.join(new_lines)

    # Clean up imports of removed constants
    const_import_pattern = re.compile(r"import\s*\{([^}]+)\}\s*from\s*'@/lib/constants'")
    m = const_import_pattern.search(content)
    if m:
        imports_str = m.group(1)
        imports_list = [s.strip() for s in imports_str.split(',')]
        remaining = [s for s in imports_list if s not in CONST_COLORS and s]
        if remaining:
            new_imports = ', '.join(remaining)
            content = content[:m.start()] + f"import {{ {new_imports} }} from '@/lib/constants'" + content[m.end():]
        else:
            start = m.start()
            end = m.end()
            while end < len(content) and content[end] in ';\n':
                end += 1
            content = content[:start] + content[end:]

    # Remove empty imports
    content = re.sub(r"import\s*\{\s*\}\s*from\s*'@/lib/constants';\n?", "", content)

    # Clean up triple+ newlines
    content = re.sub(r'\n{3,}', '\n\n', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"DONE: {relpath}")
    else:
        print(f"NO CHANGES: {relpath}")

for f in files:
    try:
        process_file(f)
    except Exception as e:
        import traceback
        print(f"ERROR: {f} - {e}")
        traceback.print_exc()
