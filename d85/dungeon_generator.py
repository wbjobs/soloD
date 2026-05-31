import pygame
import random
import heapq
from collections import defaultdict, deque

TILE_SIZE = 32
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
CHUNK_SIZE = 16

FLOOR = 0
WALL = 1
DOOR = 2

COLORS = {
    FLOOR: (139, 119, 101),
    WALL: (50, 50, 60),
    DOOR: (139, 90, 43),
}

TILE_NAMES = {
    FLOOR: "地板",
    WALL: "墙壁",
    DOOR: "门",
}

NEIGHBOR_OFFSETS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def is_walkable(tile):
    return tile in (FLOOR, DOOR)


def bfs_connected_regions(grid, start_from_edge=False):
    height = len(grid)
    width = len(grid[0])
    visited = [[False for _ in range(width)] for _ in range(height)]
    regions = []

    for y in range(height):
        for x in range(width):
            if not visited[y][x] and is_walkable(grid[y][x]):
                if start_from_edge and not (x == 0 or x == width - 1 or y == 0 or y == height - 1):
                    continue

                queue = deque()
                queue.append((x, y))
                visited[y][x] = True
                region = []

                while queue:
                    cx, cy = queue.popleft()
                    region.append((cx, cy))

                    for dx, dy in NEIGHBOR_OFFSETS:
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            if not visited[ny][nx] and is_walkable(grid[ny][nx]):
                                visited[ny][nx] = True
                                queue.append((nx, ny))

                if region:
                    regions.append(region)

    return regions


def find_best_connection_path(grid, region1, region2):
    height = len(grid)
    width = len(grid[0])

    start_points = region1
    target_set = set(region2)

    queue = deque()
    visited = {}

    for (x, y) in start_points:
        queue.append((x, y, 0))
        visited[(x, y)] = None

    best_path = None
    min_cost = float('inf')

    while queue:
        x, y, cost = queue.popleft()

        if (x, y) in target_set:
            if cost < min_cost:
                path = []
                current = (x, y)
                while current is not None:
                    path.append(current)
                    current = visited[current]
                path.reverse()
                best_path = path
                min_cost = cost
            continue

        if cost >= min_cost:
            continue

        for dx, dy in NEIGHBOR_OFFSETS:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                new_cost = cost
                if grid[ny][nx] == WALL:
                    new_cost += 3
                elif not is_walkable(grid[ny][nx]):
                    new_cost += 1

                visited[(nx, ny)] = (x, y)
                queue.append((nx, ny, new_cost))

    return best_path


def connect_regions(grid, region1, region2):
    path = find_best_connection_path(grid, region1, region2)
    if not path or len(path) < 2:
        return False

    for i, (x, y) in enumerate(path):
        if grid[y][x] == WALL:
            if i == 0 or i == len(path) - 1:
                grid[y][x] = DOOR
            else:
                grid[y][x] = FLOOR

    return True


def fix_islands_in_grid(grid, ensure_edge_connection=True):
    height = len(grid)
    width = len(grid[0])

    regions = bfs_connected_regions(grid)

    if len(regions) <= 1:
        return grid

    edge_regions = []
    inner_regions = []

    for region in regions:
        has_edge = any(
            x == 0 or x == width - 1 or y == 0 or y == height - 1
            for (x, y) in region
        )
        if has_edge:
            edge_regions.append(region)
        else:
            inner_regions.append(region)

    if not edge_regions:
        if regions:
            main_region = max(regions, key=len)
            for (x, y) in main_region:
                if x == 0 or x == width - 1 or y == 0 or y == height - 1:
                    grid[y][x] = FLOOR
                    break
        edge_regions = [main_region] if regions else []
        inner_regions = [r for r in regions if r != main_region] if regions else []

    main_region = max(edge_regions, key=len) if edge_regions else []

    for region in inner_regions:
        connect_regions(grid, main_region, region)

    for region in edge_regions:
        if region != main_region:
            connect_regions(grid, main_region, region)

    return grid


TAG_NORMAL = 0
TAG_DEAD_END = 1
TAG_CORRIDOR = 2
TAG_ROOM = 3

TAG_COLORS = {
    TAG_NORMAL: (0, 0, 0, 0),
    TAG_DEAD_END: (255, 215, 0, 100),
    TAG_CORRIDOR: (255, 100, 100, 100),
    TAG_ROOM: (100, 100, 255, 100),
}


def count_walkable_neighbors(grid, x, y):
    height = len(grid)
    width = len(grid[0])
    count = 0
    for dx, dy in NEIGHBOR_OFFSETS:
        nx, ny = x + dx, y + dy
        if 0 <= nx < width and 0 <= ny < height:
            if is_walkable(grid[ny][nx]):
                count += 1
    return count


def find_dead_ends(grid):
    height = len(grid)
    width = len(grid[0])
    dead_ends = []

    for y in range(height):
        for x in range(width):
            if is_walkable(grid[y][x]):
                neighbors = count_walkable_neighbors(grid, x, y)
                if neighbors == 1:
                    dead_ends.append((x, y))

    return dead_ends


def find_corridors(grid):
    height = len(grid)
    width = len(grid[0])
    corridors = []

    for y in range(height):
        for x in range(width):
            if is_walkable(grid[y][x]):
                neighbors = count_walkable_neighbors(grid, x, y)
                if 2 <= neighbors <= 3:
                    is_linear = False
                    horizontal = (
                        (x - 1 >= 0 and is_walkable(grid[y][x - 1])) and
                        (x + 1 < width and is_walkable(grid[y][x + 1]))
                    )
                    vertical = (
                        (y - 1 >= 0 and is_walkable(grid[y - 1][x])) and
                        (y + 1 < height and is_walkable(grid[y + 1][x]))
                    )
                    if horizontal or vertical:
                        corridors.append((x, y))

    return corridors


def find_rooms(grid):
    height = len(grid)
    width = len(grid[0])
    rooms = []

    for y in range(height):
        for x in range(width):
            if is_walkable(grid[y][x]):
                neighbors = count_walkable_neighbors(grid, x, y)
                if neighbors >= 3:
                    is_open = True
                    for dy in [-1, 0, 1]:
                        for dx in [-1, 0, 1]:
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < width and 0 <= ny < height:
                                if grid[ny][nx] == WALL:
                                    is_open = False
                                    break
                        if not is_open:
                            break
                    if is_open:
                        rooms.append((x, y))

    return rooms


def analyze_semantic_tags(grid):
    height = len(grid)
    width = len(grid[0])

    tags = [[TAG_NORMAL for _ in range(width)] for _ in range(height)]

    dead_ends = find_dead_ends(grid)
    corridors = find_corridors(grid)
    rooms = find_rooms(grid)

    visited = [[False for _ in range(width)] for _ in range(height)]
    for (x, y) in dead_ends:
        tags[y][x] = TAG_DEAD_END
        visited[y][x] = True

        queue = deque()
        queue.append((x, y, 0))

        while queue:
            cx, cy, dist = queue.popleft()
            neighbors = count_walkable_neighbors(grid, cx, cy)
            if neighbors > 2:
                break

            for dx, dy in NEIGHBOR_OFFSETS:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if is_walkable(grid[ny][nx]) and not visited[ny][nx]:
                        visited[ny][nx] = True
                        if dist + 1 < 5:
                            tags[ny][nx] = TAG_DEAD_END
                            queue.append((nx, ny, dist + 1))

    for (x, y) in corridors:
        if tags[y][x] == TAG_NORMAL:
            tags[y][x] = TAG_CORRIDOR

    for (x, y) in rooms:
        if tags[y][x] == TAG_NORMAL:
            tags[y][x] = TAG_ROOM

    return tags


def find_chest_spawn_points(grid, tags, max_points=5):
    height = len(grid)
    width = len(grid[0])
    spawn_points = []

    for y in range(height):
        for x in range(width):
            if tags[y][x] == TAG_DEAD_END and is_walkable(grid[y][x]):
                spawn_points.append((x, y))

    random.shuffle(spawn_points)
    return spawn_points[:max_points]


def find_monster_spawn_points(grid, tags, max_points=10):
    height = len(grid)
    width = len(grid[0])
    spawn_points = []

    for y in range(height):
        for x in range(width):
            if tags[y][x] == TAG_CORRIDOR and is_walkable(grid[y][x]):
                spawn_points.append((x, y))

    random.shuffle(spawn_points)
    return spawn_points[:max_points]


class WaveFunctionCollapse:
    def __init__(self, example_map):
        self.example_map = example_map
        self.tiles = list(set([tile for row in example_map for tile in row]))
        self.adjacency_rules = self._extract_adjacency_rules()
        self.tile_probabilities = self._calculate_tile_probabilities()

    def _extract_adjacency_rules(self):
        rules = defaultdict(lambda: defaultdict(set))
        height = len(self.example_map)
        width = len(self.example_map[0])

        for y in range(height):
            for x in range(width):
                current_tile = self.example_map[y][x]
                for dx, dy in NEIGHBOR_OFFSETS:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        neighbor_tile = self.example_map[ny][nx]
                        direction = (dx, dy)
                        rules[current_tile][direction].add(neighbor_tile)

        return rules

    def _calculate_tile_probabilities(self):
        total = len(self.example_map) * len(self.example_map[0])
        counts = defaultdict(int)
        for row in self.example_map:
            for tile in row:
                counts[tile] += 1
        return {tile: count / total for tile, count in counts.items()}

    def get_allowed_neighbors(self, tile, direction):
        if tile not in self.adjacency_rules:
            return set(self.tiles)
        return self.adjacency_rules[tile].get(direction, set(self.tiles))

    def run_on_grid(self, grid, start_pos=None, ensure_connections=True):
        height = len(grid)
        width = len(grid[0])

        possible_tiles = [[set(self.tiles) for _ in range(width)] for _ in range(height)]

        for y in range(height):
            for x in range(width):
                if grid[y][x] is not None:
                    possible_tiles[y][x] = {grid[y][x]}

        heap = []
        for y in range(height):
            for x in range(width):
                if grid[y][x] is None:
                    entropy = len(possible_tiles[y][x])
                    if entropy > 0:
                        heapq.heappush(heap, (entropy + random.random(), x, y))

        while heap:
            current = heapq.heappop(heap)
            _, x, y = current

            if grid[y][x] is not None:
                continue

            if not possible_tiles[y][x]:
                possible_tiles[y][x] = set(self.tiles)

            if len(possible_tiles[y][x]) == 1:
                grid[y][x] = list(possible_tiles[y][x])[0]
            else:
                available = list(possible_tiles[y][x])
                weights = [self.tile_probabilities.get(t, 1) for t in available]
                total = sum(weights)
                if total > 0:
                    probs = [w / total for w in weights]
                    r = random.random()
                    cum = 0
                    for i, p in enumerate(probs):
                        cum += p
                        if r <= cum:
                            grid[y][x] = available[i]
                            break
                    else:
                        grid[y][x] = random.choice(available)
                else:
                    grid[y][x] = random.choice(available)

            for dx, dy in NEIGHBOR_OFFSETS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and grid[ny][nx] is None:
                    opposite_dir = (-dx, -dy)
                    allowed = self.get_allowed_neighbors(grid[y][x], opposite_dir)

                    if allowed:
                        new_possible = possible_tiles[ny][nx] & allowed
                        if not new_possible:
                            new_possible = possible_tiles[ny][nx]
                    else:
                        new_possible = possible_tiles[ny][nx]

                    if len(new_possible) < len(possible_tiles[ny][nx]):
                        possible_tiles[ny][nx] = new_possible
                        entropy = len(possible_tiles[ny][nx])
                        heapq.heappush(heap, (entropy + random.random(), nx, ny))

        if ensure_connections:
            fix_islands_in_grid(grid)

        return grid


class InfiniteDungeon:
    def __init__(self, wfc):
        self.wfc = wfc
        self.chunks = {}
        self.chunk_tags = {}
        self.chest_spawns = {}
        self.monster_spawns = {}
        self.viewport_x = 0
        self.viewport_y = 0
        self.tile_size = TILE_SIZE

    def get_chunk_key(self, cx, cy):
        return (cx, cy)

    def _ensure_chunk_connections(self, cx, cy, grid):
        size = CHUNK_SIZE

        connection_points = []
        for x in [size // 4, size // 2, 3 * size // 4]:
            if grid[0][x] == WALL:
                connection_points.append((x, 0))
            if grid[size - 1][x] == WALL:
                connection_points.append((x, size - 1))

        for y in [size // 4, size // 2, 3 * size // 4]:
            if grid[y][0] == WALL:
                connection_points.append((0, y))
            if grid[y][size - 1] == WALL:
                connection_points.append((size - 1, y))

        num_connections = random.randint(2, 4)
        selected_points = random.sample(
            connection_points, min(num_connections, len(connection_points))
        )

        for x, y in selected_points:
            grid[y][x] = random.choice([FLOOR, DOOR])

        return grid

    def generate_chunk(self, cx, cy):
        key = self.get_chunk_key(cx, cy)
        if key in self.chunks:
            return

        grid = [[None for _ in range(CHUNK_SIZE)] for _ in range(CHUNK_SIZE)]

        for dx, dy in NEIGHBOR_OFFSETS:
            neighbor_key = self.get_chunk_key(cx + dx, cy + dy)
            if neighbor_key in self.chunks:
                neighbor_chunk = self.chunks[neighbor_key]
                if dx == 1:
                    for y in range(CHUNK_SIZE):
                        grid[y][0] = neighbor_chunk[y][CHUNK_SIZE - 1]
                elif dx == -1:
                    for y in range(CHUNK_SIZE):
                        grid[y][CHUNK_SIZE - 1] = neighbor_chunk[y][0]
                elif dy == 1:
                    for x in range(CHUNK_SIZE):
                        grid[0][x] = neighbor_chunk[CHUNK_SIZE - 1][x]
                elif dy == -1:
                    for x in range(CHUNK_SIZE):
                        grid[CHUNK_SIZE - 1][x] = neighbor_chunk[0][x]

        self.wfc.run_on_grid(grid, ensure_connections=True)

        self._ensure_chunk_connections(cx, cy, grid)

        self.chunks[key] = grid

        tags = analyze_semantic_tags(grid)
        self.chunk_tags[key] = tags

        chests = find_chest_spawn_points(grid, tags, max_points=3)
        self.chest_spawns[key] = chests

        monsters = find_monster_spawn_points(grid, tags, max_points=5)
        self.monster_spawns[key] = monsters

    def get_tile(self, x, y):
        cx = x // CHUNK_SIZE
        cy = y // CHUNK_SIZE
        key = self.get_chunk_key(cx, cy)

        if key not in self.chunks:
            self.generate_chunk(cx, cy)

        local_x = x % CHUNK_SIZE
        local_y = y % CHUNK_SIZE
        return self.chunks[key][local_y][local_x]

    def get_tag(self, x, y):
        cx = x // CHUNK_SIZE
        cy = y // CHUNK_SIZE
        key = self.get_chunk_key(cx, cy)

        if key not in self.chunk_tags:
            self.generate_chunk(cx, cy)

        local_x = x % CHUNK_SIZE
        local_y = y % CHUNK_SIZE
        return self.chunk_tags[key][local_y][local_x]

    def is_chest_spawn(self, x, y):
        cx = x // CHUNK_SIZE
        cy = y // CHUNK_SIZE
        key = self.get_chunk_key(cx, cy)

        if key not in self.chest_spawns:
            self.generate_chunk(cx, cy)

        local_x = x % CHUNK_SIZE
        local_y = y % CHUNK_SIZE
        return (local_x, local_y) in self.chest_spawns[key]

    def is_monster_spawn(self, x, y):
        cx = x // CHUNK_SIZE
        cy = y // CHUNK_SIZE
        key = self.get_chunk_key(cx, cy)

        if key not in self.monster_spawns:
            self.generate_chunk(cx, cy)

        local_x = x % CHUNK_SIZE
        local_y = y % CHUNK_SIZE
        return (local_x, local_y) in self.monster_spawns[key]

    def ensure_chunks_around(self, center_x, center_y, radius):
        cx_center = center_x // CHUNK_SIZE
        cy_center = center_y // CHUNK_SIZE

        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                self.generate_chunk(cx_center + dx, cy_center + dy)


def create_example_map():
    return [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 1, 1, 2, 1, 1, 0, 1],
        [1, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 2, 0, 0, 0, 0, 0, 0, 2, 1],
        [1, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 0, 1, 1, 2, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ]


def draw_example_map(screen, example_map):
    pygame.draw.rect(screen, (30, 30, 40), (10, 10, 350, 380))
    font = pygame.font.Font(None, 32)
    title = font.render("示例地图", True, (255, 255, 255))
    screen.blit(title, (20, 20))

    tile_size = 28
    offset_x = 50
    offset_y = 70

    for y, row in enumerate(example_map):
        for x, tile in enumerate(row):
            rect = pygame.Rect(
                offset_x + x * tile_size,
                offset_y + y * tile_size,
                tile_size - 1,
                tile_size - 1,
            )
            pygame.draw.rect(screen, COLORS[tile], rect)

    legend_y = offset_y + len(example_map) * tile_size + 20
    for tile_type, color in COLORS.items():
        pygame.draw.rect(
            screen, color, (50, legend_y, 20, 20)
        )
        text = font.render(TILE_NAMES[tile_type], True, (255, 255, 255))
        screen.blit(text, (80, legend_y))
        legend_y += 30


def draw_semantic_legend(screen):
    font = pygame.font.Font(None, 24)
    legend_items = [
        ("宝箱 (死胡同)", (255, 215, 0)),
        ("怪物 (长廊)", (255, 100, 100)),
        ("房间", (100, 100, 255)),
    ]

    x = 50
    y = 400

    title = font.render("语义标签:", True, (200, 200, 200))
    screen.blit(title, (x, y))
    y += 30

    for label, color in legend_items:
        pygame.draw.rect(screen, color, (x, y, 15, 15))
        text = font.render(label, True, (200, 200, 200))
        screen.blit(text, (x + 25, y))
        y += 25


def draw_controls(screen):
    font = pygame.font.Font(None, 28)
    controls = [
        "方向键: 移动视野",
        "空格键: 重新生成",
        "R键: 重置视野",
        "C键: 调试模式",
        "T键: 语义标签",
    ]

    y = WINDOW_HEIGHT - 160
    for control in controls:
        text = font.render(control, True, (200, 200, 200))
        screen.blit(text, (20, y))
        y += 30


def main():
    pygame.init()
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("地下城地图生成器 - 波函数坍缩")
    clock = pygame.time.Clock()

    example_map = create_example_map()
    wfc = WaveFunctionCollapse(example_map)
    dungeon = InfiniteDungeon(wfc)

    dungeon.ensure_chunks_around(0, 0, 3)

    view_speed = 5
    show_debug = False
    show_semantic_tags = False
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    dungeon.chunks = {}
                    dungeon.chunk_tags = {}
                    dungeon.chest_spawns = {}
                    dungeon.monster_spawns = {}
                    dungeon.ensure_chunks_around(0, 0, 3)
                elif event.key == pygame.K_r:
                    dungeon.viewport_x = 0
                    dungeon.viewport_y = 0
                elif event.key == pygame.K_c:
                    show_debug = not show_debug
                elif event.key == pygame.K_t:
                    show_semantic_tags = not show_semantic_tags

        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT]:
            dungeon.viewport_x -= view_speed
        if keys[pygame.K_RIGHT]:
            dungeon.viewport_x += view_speed
        if keys[pygame.K_UP]:
            dungeon.viewport_y -= view_speed
        if keys[pygame.K_DOWN]:
            dungeon.viewport_y += view_speed

        center_tile_x = dungeon.viewport_x // TILE_SIZE + WINDOW_WIDTH // (2 * TILE_SIZE)
        center_tile_y = dungeon.viewport_y // TILE_SIZE + WINDOW_HEIGHT // (2 * TILE_SIZE)
        dungeon.ensure_chunks_around(center_tile_x, center_tile_y, 4)

        screen.fill((20, 20, 30))

        start_x = (WINDOW_WIDTH - 360) // 2 + 360
        start_y = 50
        width = WINDOW_WIDTH - start_x - 50
        height = WINDOW_HEIGHT - 100

        viewport_rect = pygame.Rect(start_x, start_y, width, height)
        pygame.draw.rect(screen, (40, 40, 50), viewport_rect)

        start_tile_x = dungeon.viewport_x // TILE_SIZE - 1
        start_tile_y = dungeon.viewport_y // TILE_SIZE - 1
        end_tile_x = (dungeon.viewport_x + WINDOW_WIDTH) // TILE_SIZE + 2
        end_tile_y = (dungeon.viewport_y + WINDOW_HEIGHT) // TILE_SIZE + 2

        for tile_y in range(start_tile_y, end_tile_y):
            for tile_x in range(start_tile_x, end_tile_x):
                screen_x = start_x + (tile_x * TILE_SIZE - dungeon.viewport_x)
                screen_y = start_y + (tile_y * TILE_SIZE - dungeon.viewport_y)

                if screen_x + TILE_SIZE < start_x or screen_x > start_x + width:
                    continue
                if screen_y + TILE_SIZE < start_y or screen_y > start_y + height:
                    continue

                tile = dungeon.get_tile(tile_x, tile_y)
                rect = pygame.Rect(screen_x, screen_y, TILE_SIZE - 1, TILE_SIZE - 1)
                pygame.draw.rect(screen, COLORS[tile], rect)

                if show_semantic_tags and is_walkable(tile):
                    tag = dungeon.get_tag(tile_x, tile_y)
                    if tag != TAG_NORMAL:
                        color = TAG_COLORS[tag][:3]
                        overlay = pygame.Surface((TILE_SIZE - 1, TILE_SIZE - 1), pygame.SRCALPHA)
                        overlay.fill((*color, 80))
                        screen.blit(overlay, (screen_x, screen_y))

                if show_debug:
                    cx = tile_x // CHUNK_SIZE
                    cy = tile_y // CHUNK_SIZE
                    lx = tile_x % CHUNK_SIZE
                    ly = tile_y % CHUNK_SIZE
                    if lx == 0 or lx == CHUNK_SIZE - 1 or ly == 0 or ly == CHUNK_SIZE - 1:
                        pygame.draw.rect(screen, (100, 100, 150), rect, 1)

        if show_semantic_tags:
            for tile_y in range(start_tile_y, end_tile_y):
                for tile_x in range(start_tile_x, end_tile_x):
                    screen_x = start_x + (tile_x * TILE_SIZE - dungeon.viewport_x)
                    screen_y = start_y + (tile_y * TILE_SIZE - dungeon.viewport_y)

                    if screen_x + TILE_SIZE < start_x or screen_x > start_x + width:
                        continue
                    if screen_y + TILE_SIZE < start_y or screen_y > start_y + height:
                        continue

                    if dungeon.is_chest_spawn(tile_x, tile_y):
                        center_x = screen_x + TILE_SIZE // 2
                        center_y = screen_y + TILE_SIZE // 2
                        pygame.draw.circle(screen, (255, 215, 0), (center_x, center_y), 8)
                        pygame.draw.rect(screen, (139, 90, 43), (screen_x + 8, screen_y + 10, 16, 12))

                    if dungeon.is_monster_spawn(tile_x, tile_y):
                        center_x = screen_x + TILE_SIZE // 2
                        center_y = screen_y + TILE_SIZE // 2
                        pygame.draw.polygon(screen, (255, 0, 0), [(center_x, center_y - 8), (center_x - 8, center_y + 8), (center_x + 8, center_y + 8)])

        draw_example_map(screen, example_map)

        font = pygame.font.Font(None, 36)
        title = font.render("生成的地下城", True, (255, 255, 255))
        screen.blit(title, (start_x, 15))

        coords_text = font.render(
            f"位置: ({dungeon.viewport_x // TILE_SIZE}, {dungeon.viewport_y // TILE_SIZE})",
            True,
            (200, 200, 200),
        )
        screen.blit(coords_text, (start_x, WINDOW_HEIGHT - 50))

        if show_debug:
            debug_text = font.render("调试模式: 开启", True, (200, 150, 150))
            screen.blit(debug_text, (start_x, WINDOW_HEIGHT - 80))

        if show_semantic_tags:
            semantic_text = font.render("语义标签: 开启", True, (200, 150, 150))
            screen.blit(semantic_text, (start_x, WINDOW_HEIGHT - 110))
            draw_semantic_legend(screen)

        draw_controls(screen)

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()
