// A shared reference point for this scene's scale. The dropped-in models
// (desk, door leaf, wall/floor/ceiling tiles) are all authored in real
// meters, so this fixes ONE conversion factor - scene units per meter -
// that every real-world-scaled prop is rendered at (via createGltfModel's
// `scale` argument), instead of each one being tuned by eye independently
// and drifting out of proportion with the others.
export const SCENE_SCALE = 6; // scene units per real-world meter

export const EYE_HEIGHT = 10;
export const HUMAN_HEIGHT = 1.75 * SCENE_SCALE; // ~10.5, an average adult
