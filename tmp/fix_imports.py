import re
import os

BASE = "C:/Users/Lian Li/UpDown/apps/web/src"

# Fix broken imports where t.gain, t.up etc. appear in import statements
# These should be removed since they're now accessed via the hook

# Also fix MEDAL_COLORS and CYAN issues

def fix_file(filepath):
    if not os.path.exists(filepath):
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Fix import lines containing t.xxx
    # Pattern: import { ..., t.gain, ..., t.up, ... } from '@/lib/constants'
    const_import_pattern = re.compile(r"import\s*\{([^}]+)\}\s*from\s*'@/lib/constants'")
    m = const_import_pattern.search(content)
    if m:
        imports_str = m.group(1)
        imports_list = [s.strip() for s in imports_str.split(',')]
        # Remove any that start with t. (broken references)
        remaining = [s for s in imports_list if s and not s.startswith('t.')]
        if remaining:
            new_imports = ', '.join(remaining)
            content = content[:m.start()] + f"import {{ {new_imports} }} from '@/lib/constants'" + content[m.end():]
        else:
            # Remove entire import line
            start = m.start()
            end = m.end()
            while end < len(content) and content[end] in ';\n':
                end += 1
            content = content[:start] + content[end:]

    # Fix remaining CYAN references - replace with t.up
    content = content.replace('CYAN', 't.up')

    # Fix MEDAL_COLORS references - define inside component functions that use it
    if 'MEDAL_COLORS' in content and 'const MEDAL_COLORS' not in content:
        # Find the function that uses MEDAL_COLORS and add the const there
        # Look for "const t = useThemeTokens();" and add MEDAL_COLORS after it
        content = content.replace(
            'const t = useThemeTokens();',
            'const t = useThemeTokens();\n  const MEDAL_COLORS = [t.gold, t.silver, t.bronze];',
            1  # only first occurrence
        )

    # Fix MEDAL_COLORS border pattern: `1.5px solid ${MEDAL_COLORS[rank - 1]}40`
    # This should use withAlpha
    content = re.sub(
        r'`1\.5px solid \$\{MEDAL_COLORS\[([^]]+)\]\}40`',
        r'`1.5px solid ${withAlpha(MEDAL_COLORS[\1], 0.25)}`',
        content
    )

    # Fix `${t.up}10` style patterns that weren't caught
    hex_alpha_map = {
        '08': 0.03, '10': 0.06, '11': 0.07, '12': 0.07, '15': 0.08, '18': 0.09,
        '1A': 0.10, '20': 0.13, '22': 0.13, '25': 0.15, '30': 0.19, '40': 0.25,
        '44': 0.27, '50': 0.31, '60': 0.38, '80': 0.50, '88': 0.53,
        '4D': 0.30, 'CC': 0.80, 'DD': 0.87,
    }

    for hexval, decimal in hex_alpha_map.items():
        # Pattern in template literals: `${t.xxx}HH`
        pattern = re.compile(r'`\$\{(t\.[a-zA-Z_.[\]0-9]+)\}' + hexval + '`')
        if pattern.search(content):
            content = pattern.sub(f'withAlpha(\\1, {decimal})', content)

        # Pattern inside larger template literals: ...${t.xxx}HH...
        pattern2 = re.compile(r'\$\{(t\.[a-zA-Z_.[\]0-9]+)\}' + hexval + r'(?=[^0-9a-fA-F])')
        if pattern2.search(content):
            content = pattern2.sub(f'${{withAlpha(\\1, {decimal})}}', content)

    # Ensure withAlpha is imported if used
    if 'withAlpha(' in content and "import { withAlpha }" not in content:
        content = content.replace(
            "import { useThemeTokens } from '@/app/providers';",
            "import { useThemeTokens } from '@/app/providers';\nimport { withAlpha } from '@/lib/theme';"
        )

    # Remove empty import lines
    content = re.sub(r"import\s*\{\s*\}\s*from\s*'@/lib/constants';\n?", "", content)

    # Fix `'rgba(0, 229, 255, 0.1)'` (cyan-specific) → withAlpha(t.up, 0.1)
    content = content.replace("'rgba(0, 229, 255, 0.1)'", "withAlpha(t.up, 0.1)")
    content = content.replace("'rgba(0, 229, 255, 0.06)'", "withAlpha(t.up, 0.06)")
    content = content.replace("'rgba(0, 229, 255, 0.08)'", "withAlpha(t.up, 0.08)")
    content = content.replace("'rgba(255, 82, 82, 0.06)'", "withAlpha(t.down, 0.06)")

    # Clean triple newlines
    content = re.sub(r'\n{3,}', '\n\n', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"FIXED: {filepath}")
    else:
        print(f"OK: {filepath}")


# Process all component files
for root, dirs, filenames in os.walk(os.path.join(BASE, "components")):
    for fn in filenames:
        if fn.endswith('.tsx') or fn.endswith('.ts'):
            filepath = os.path.join(root, fn)
            try:
                fix_file(filepath)
            except Exception as e:
                print(f"ERROR: {filepath} - {e}")
