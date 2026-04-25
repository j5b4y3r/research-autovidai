import { VideoTemplate } from '../types';

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'floating-3d-bento',
    name: '3D Floating Bento',
    description: 'Cinematic 2.5D/3D camera depth, floating UI cards, and smooth isometric rotations.',
    plannerPrompt: `
STRUCTURE & ANIMATION RULES:
- ENVIRONMENT: Create a deep, volumetric 2.5D or 3D camera feel. Elements should move with parallax. Lighting should be cinematic with soft drop shadows and dramatic lighting highlights.
- HOOK (First scene): Massive, bold kinetic typography. Animate the text word-by-word with a heavy upward thrust (overshoot easing) and deep glowing text-shadows.
- BODY/UI MOCKUPS: Do not show flat websites. Extrude UI elements into floating, glass-like 'bento box' cards scattered in isometric 3D space. As you transition between features, rotate the virtual camera slowly to reveal new floating UI cards.
- TRANSITIONS: Use seamless camera sweeps (e.g., fast zoom-ins that push through one UI card to reveal the next layer behind it).
- NOTE: Apply the extracted brand color palette to colored glowing lights behind the floating UI cards, and use the brand's exact typography.
    `.trim()
  },
  {
    id: 'minimal-kinetic',
    name: 'Minimal Kinetic Typography',
    description: 'High energy 2D text animations and abstract shapes. Focuses on the message with snappy transitions.',
    plannerPrompt: `
STRUCTURE & ANIMATION RULES:
- ENVIRONMENT: Pure, clean 2D workspace. Highly minimalist. Rely on a solid background color (derived from the brand kit) mixed with very subtle, massive abstract geometric shapes matching the logo.
- HOOK (First scene): Rapid-fire text replacement. Sentences shouldn't just slide in; they should glitch, scale up from 0, or reveal via masking boxes with very fast, bouncy ease-out curves.
- BODY/UI MOCKUPS: Minimize complex UI replication. If displaying a feature, abstract it. Use oversized interface icons (like a giant cursor, a huge toggle switch, or a massive notification bubble) that pop onto the screen with a satisfying spring bounce. 
- TRANSITIONS: Hard cuts, fast whip pans (slide left/right at extreme speeds with motion blur), and geometric wipe transitions (circles expanding to fill the screen).
- NOTE: Ensure the typography matches the brand kit perfectly since text is the primary visual. Contrasting brand colors should be used for text highlights.
    `.trim()
  },
  {
    id: 'story-walkthrough',
    name: 'Product Walkthrough',
    description: 'Simulated user journey with an animated cursor guiding the viewer through the primary UI elements.',
    plannerPrompt: `
STRUCTURE & ANIMATION RULES:
- ENVIRONMENT: 2D flat screen space simulating a high-quality browser or device frame. 
- HOOK (First scene): Start with the primary problem statement appearing as a "search query" or a "typing effect" in the center of the screen, followed by a satisfying "Click" SFX.
- BODY/UI MOCKUPS: Build clean, front-facing replications of the SaaS UI. Introduce an animated, oversized stylized cursor (like a neon or brand-colored arrow/hand). The cursor should fly across the screen with smooth bezier curves to click on buttons, dragging sliders, or opening menus.
- TRANSITIONS: Masking reveals (e.g., a new UI screen wipes smoothly over the old one from bottom to top). 
- NOTE: Color the UI frames, headers, and primary buttons using the extracted brand colors. Use the brand's typography for all interface text.
    `.trim()
  }
];
