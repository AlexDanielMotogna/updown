import re
import os

BASE = "C:/Users/Lian Li/UpDown/apps/web/src"

def fix_tooltip_slotprops(filepath):
    """Move tooltipSlotProps from module level into function scope by converting to a function."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'const tooltipSlotProps' not in content:
        return

    original = content

    # Replace the module-level const with nothing
    content = re.sub(
        r"const tooltipSlotProps = \{[^}]+\{[^}]+\}[^}]+\{[^}]+\}[^}]*\}\s*as\s*const;\n*",
        "",
        content,
        flags=re.DOTALL
    )

    # Add tooltipSlotProps creation inside each exported function that uses it
    # Find "const t = useThemeTokens();" and add tooltipSlotProps after it
    if 'tooltipSlotProps' in content:
        content = content.replace(
            'const t = useThemeTokens();',
            'const t = useThemeTokens();\n  const tooltipSlotProps = {\n    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: \'0.75rem\' } },\n    arrow: { sx: { color: t.bg.tooltip } },\n  } as const;',
            1  # first occurrence only
        )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED tooltipSlotProps: {filepath}")


def fix_winner_color_fn(filepath):
    """Move winnerColor function from module level into component."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Check for module-level functions using t.
    # winnerColor and winnerLabel in PoolsSidebarList
    if 'function winnerColor(pool: Pool): string {' in content:
        # Remove the module-level function
        pattern = re.compile(r'function winnerColor\(pool: Pool\): string \{[^}]+\}', re.DOTALL)
        m = pattern.search(content)
        if m:
            fn_body = m.group(0)
            content = content.replace(fn_body + '\n\n', '')
            content = content.replace(fn_body + '\n', '')
            content = content.replace(fn_body, '')

            # Add it inside the component
            content = content.replace(
                'const t = useThemeTokens();',
                'const t = useThemeTokens();\n\n  function winnerColor(pool: Pool): string {\n    if (pool.winner === \'UP\') return t.up;\n    if (pool.winner === \'DOWN\') return t.down;\n    return t.draw;\n  }',
                1
            )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED winnerColor: {filepath}")


def fix_missing_withAlpha(filepath):
    """Add withAlpha import where it's used but not imported."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    if 'withAlpha(' in content and "import { withAlpha }" not in content and "withAlpha" not in content.split('\n')[0]:
        if "from '@/lib/theme'" in content:
            # Already has a theme import, might need to add withAlpha to it
            pass
        else:
            content = content.replace(
                "import { useThemeTokens } from '@/app/providers';",
                "import { useThemeTokens } from '@/app/providers';\nimport { withAlpha } from '@/lib/theme';"
            )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED withAlpha import: {filepath}")


def fix_odds_chart(filepath):
    """Fix variable shadowing in OddsChart where yTicks/xTicks use 't' as loop var."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # The issue is the SVG grid section uses (t, i) => for yTicks mapping
    # where t shadows the theme tokens. Rename to 'tick' or 'yt'
    # Pattern: {yTicks.map((t, i) => ( and {xTicks.map((t, i) =>
    content = content.replace('yTicks.map((t, i)', 'yTicks.map((yt, i)')
    content = content.replace('xTicks.map((t, i)', 'xTicks.map((xt, i)')
    content = content.replace('t.y}', 'yt.y}')
    content = content.replace('t.p)}', 'yt.p)}')
    content = content.replace('t.label}', 'xt.label}')
    content = content.replace('t.x}', 'xt.x}')

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED OddsChart: {filepath}")


# Fix referral files with tooltipSlotProps
for fn in ['EarningsTab.tsx', 'PayoutsTab.tsx', 'ReferralShareLink.tsx', 'ReferralStatsCards.tsx', 'ReferralTab.tsx']:
    fix_tooltip_slotprops(os.path.join(BASE, 'components/referral', fn))

# Fix PoolsSidebarList
fix_winner_color_fn(os.path.join(BASE, 'components/sidebar/PoolsSidebarList.tsx'))

# Fix missing withAlpha imports
fix_missing_withAlpha(os.path.join(BASE, 'components/ai-bot/ChatMessage.tsx'))
fix_missing_withAlpha(os.path.join(BASE, 'components/ai-bot/SignalCard.tsx'))

# Fix OddsChart variable shadowing
fix_odds_chart(os.path.join(BASE, 'components/pool/OddsChart.tsx'))

# Check for any other files not in our list that got affected
# docs/page.tsx, status/page.tsx, tournaments/page.tsx
for f in ['app/docs/page.tsx', 'app/status/page.tsx', 'app/tournaments/page.tsx']:
    fp = os.path.join(BASE, f)
    if os.path.exists(fp):
        with open(fp, 'r', encoding='utf-8') as fh:
            c = fh.read()
        if "Cannot find name 't'" in c or re.search(r"\bt\.(bg|text|border|hover)\.", c):
            print(f"WARNING: {f} may have been accidentally affected by migration")
