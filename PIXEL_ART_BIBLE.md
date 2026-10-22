# Genesis Pixel Art Bible — v1.0

Figma source: https://www.figma.com/design/j0jGzbmTq10vTYlOoB2nZq

## Visual contract

- Logical sprite scale: one rendered sprite pixel maps to a 3 × 3 world-pixel block.
- Palette quantization: shared 16-colour palette in `pixel-style.js`.
- Outlines use dark green-black ink. Avoid species-specific outline colours.
- Lighting is consistent: cool, dark undersides; mossy midtones; warm cream highlights.
- Coral is reserved for threat cues, not used as an independent body palette.
- Sprite rendering is pixelated; selection indicators, labels, hitboxes and the observatory UI remain readable overlays.
- Simulation positions, collision boxes, AI, and movement rigs remain full precision.

## Shared palette

| Token | Hex | Use |
|---|---|---|
| Abyss | `#0C1412` | Deep negative space |
| Outline ink | `#18211C` | Common silhouette and internal ink |
| Deep stone | `#29382F` | Dark contour transitions |
| Cave stone | `#425345` | Neutral shadow and structure |
| Moss shade | `#425B31` | Deep plant pigment |
| Moss | `#79974A` | Primary living green |
| Moss light | `#B4CC70` | Lit leaf and body accents |
| Body shade | `#9A825B` | Warm earth shadow |
| Warm body | `#D3C093` | Cream/stone base |
| Body light | `#F1E2B8` | Highest non-glow highlight |
| Vineback scale | `#60764A` | Shared moss-green creature ramp |
| Scale light | `#9CAD65` | Back/scale lighting |
| Threat coral | `#D77760` | Aggression accent only |
| Biolume | `#D8F18D` | Eyes, spores and small lights |
| Water | `#5B8984` | Cool environmental accent |
| UI text | `#D8DEC8` | Shared light text token |

## Species identity

### Mossling
Rounded seed-pod silhouette; cream-green body; leaf-frond crown; small, readable eye; short soft tail. Personality changes posture and appendage timing before changing the core palette.

### Vineback
Low, long quadruped; articulated spine and tail; moss/stone body ramps; restrained coral frill and threat accents. It should read as more dangerous through silhouette, anticipation and motion, not a separate pink/red rendering style.

### Glimmer
Small luminous silhouette; gold-cream body with dark ink and restrained biolume. Brightness is an accent rather than a bloom that washes out the shared pixel clusters.

## Motion rules

- Anticipate pounces before applying the impulse.
- Body/crest response leads; tail response follows with delay.
- Keep foot contacts readable. Avoid fractional sprite scaling in the final pixel pass.
- Pixelation only touches the creature drawing layer. It must not modify hitboxes, simulation state, trails, labels, or navigation.
- Render with nearest-neighbour enlargement; never add smoothing back onto the main world canvas.
