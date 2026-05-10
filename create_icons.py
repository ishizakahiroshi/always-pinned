"""アイコン生成スクリプト (標準ライブラリのみ) - 1回だけ実行する"""
import struct, zlib, math, os

def make_png(size, pixels):
    def chunk(name, data):
        crc = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    raw = b''
    for row in pixels:
        raw += b'\x00' + b''.join(bytes(px) for px in row)
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def draw_pin(size):
    BG = (26, 115, 232)    # Google blue
    WHITE = (255, 255, 255)
    SHADOW = (13, 71, 161) # darker blue for pin outline

    pixels = [[list(BG)] * size for _ in range(size)]

    # --- ピンの頭（楕円） ---
    cx = size / 2 - 0.5
    head_cy = size * 0.35
    rx = size * 0.32  # 横半径
    ry = size * 0.26  # 縦半径

    for y in range(size):
        for x in range(size):
            # 外縁（アンチエイリアス的にシャドウ）
            dist = math.sqrt(((x - cx) / rx) ** 2 + ((y - head_cy) / ry) ** 2)
            if dist <= 1.0:
                pixels[y][x] = list(WHITE)
            elif dist <= 1.15:
                pixels[y][x] = list(SHADOW)

    # --- 針部分 ---
    needle_x = round(cx)
    needle_top = round(head_cy + ry) - 1
    needle_bottom = round(size * 0.80)
    nw = max(1, round(size * 0.09))  # 針の幅

    for y in range(needle_top, needle_bottom + 1):
        for dx in range(-nw, nw + 1):
            x = needle_x + dx
            if 0 <= x < size:
                pixels[y][x] = list(WHITE)

    return pixels

os.makedirs('icons', exist_ok=True)
for size in [16, 48, 128]:
    pixels = draw_pin(size)
    path = f'icons/icon{size}.png'
    with open(path, 'wb') as f:
        f.write(make_png(size, pixels))
    print(f'Created {path}')

print('Done.')
