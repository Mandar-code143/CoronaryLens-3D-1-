/**
 * Catalog of the named nodes inside public/models/coronary-heart.glb.
 * Every selectable structure maps to a real scene node by exact name. Nothing is matched by order or position.
 * Geometry source: Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (CC BY-SA 2.1 JP). See docs/ANATOMY_ASSET.md.
 */
export type TargetCode = 'CAD' | 'LAD' | 'LCX' | 'RCA';
export type ModelTargetCode = Exclude<TargetCode, 'CAD'>;
export type LayerId = 'chambers' | 'great_vessels' | 'coronary' | 'cardiac_veins';

export interface AnatomyNode { id: string; label: string; layer: LayerId; kind: 'chamber' | 'aorta' | 'pulmonary' | 'vein' | 'coronary' | 'cardiac_vein'; target?: ModelTargetCode; note?: string }

export const MODEL_URL = `${import.meta.env.BASE_URL}models/coronary-heart.glb`;

export const NODES: AnatomyNode[] = [
  { id: 'heart_left_ventricle', label: 'Left ventricle', layer: 'chambers', kind: 'chamber' },
  { id: 'heart_right_ventricle', label: 'Right ventricle', layer: 'chambers', kind: 'chamber' },
  { id: 'heart_left_atrium', label: 'Left atrium', layer: 'chambers', kind: 'chamber' },
  { id: 'heart_right_atrium', label: 'Right atrium', layer: 'chambers', kind: 'chamber' },
  { id: 'aorta_ascending', label: 'Ascending aorta', layer: 'great_vessels', kind: 'aorta' },
  { id: 'aorta_arch', label: 'Aortic arch', layer: 'great_vessels', kind: 'aorta' },
  { id: 'aorta_descending', label: 'Descending thoracic aorta', layer: 'great_vessels', kind: 'aorta' },
  { id: 'aorta_brachiocephalic', label: 'Brachiocephalic trunk', layer: 'great_vessels', kind: 'aorta' },
  { id: 'pulmonary_trunk', label: 'Pulmonary trunk', layer: 'great_vessels', kind: 'pulmonary' },
  { id: 'pulmonary_bifurcation', label: 'Pulmonary trunk bifurcation', layer: 'great_vessels', kind: 'pulmonary' },
  { id: 'pulmonary_left_artery', label: 'Left pulmonary artery', layer: 'great_vessels', kind: 'pulmonary' },
  { id: 'pulmonary_right_artery', label: 'Right pulmonary artery', layer: 'great_vessels', kind: 'pulmonary' },
  { id: 'vein_svc', label: 'Superior vena cava', layer: 'great_vessels', kind: 'vein' },
  { id: 'vein_pulm_rs', label: 'Right superior pulmonary vein', layer: 'great_vessels', kind: 'vein' },
  { id: 'vein_pulm_ri', label: 'Right inferior pulmonary vein', layer: 'great_vessels', kind: 'vein' },
  { id: 'vein_pulm_ls', label: 'Left superior pulmonary vein', layer: 'great_vessels', kind: 'vein' },
  { id: 'vein_pulm_li', label: 'Left inferior pulmonary vein', layer: 'great_vessels', kind: 'vein' },
  { id: 'coronary_left_main', label: 'Left main coronary artery', layer: 'coronary', kind: 'coronary', note: 'Parent of the LAD and LCX. Not a separate prediction target.' },
  { id: 'coronary_lad', label: 'Left anterior descending artery (LAD)', layer: 'coronary', kind: 'coronary', target: 'LAD' },
  { id: 'coronary_lad_septal', label: 'LAD septal branches', layer: 'coronary', kind: 'coronary', target: 'LAD' },
  { id: 'coronary_lcx', label: 'Left circumflex artery (LCX)', layer: 'coronary', kind: 'coronary', target: 'LCX' },
  { id: 'coronary_rca', label: 'Right coronary artery (RCA)', layer: 'coronary', kind: 'coronary', target: 'RCA' },
  { id: 'coronary_rca_branch', label: 'RCA right inferolateral branch', layer: 'coronary', kind: 'coronary', target: 'RCA' },
  { id: 'cardiac_vein_great', label: 'Great cardiac vein', layer: 'cardiac_veins', kind: 'cardiac_vein' },
  { id: 'cardiac_vein_middle', label: 'Middle cardiac vein', layer: 'cardiac_veins', kind: 'cardiac_vein' },
  { id: 'cardiac_coronary_sinus', label: 'Coronary sinus', layer: 'cardiac_veins', kind: 'cardiac_vein' },
];
export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
export const TARGET_NODE_IDS: Record<ModelTargetCode, string[]> = {
  LAD: NODES.filter((n) => n.target === 'LAD').map((n) => n.id),
  LCX: NODES.filter((n) => n.target === 'LCX').map((n) => n.id),
  RCA: NODES.filter((n) => n.target === 'RCA').map((n) => n.id),
};
export const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'chambers', label: 'Cardiac chambers' },
  { id: 'great_vessels', label: 'Great vessels' },
  { id: 'coronary', label: 'Coronary arteries' },
  { id: 'cardiac_veins', label: 'Cardiac veins' },
];
export const TARGETS: { code: TargetCode; name: string; short: string; scope: string }[] = [
  { code: 'CAD', name: 'Coronary artery disease (overall)', short: 'Overall', scope: 'Dataset-level outcome (Cath label). Not tied to a single artery.' },
  { code: 'LAD', name: 'Left anterior descending', short: 'LAD', scope: 'Stenotic vs. normal LAD label from the source cohort.' },
  { code: 'LCX', name: 'Left circumflex', short: 'LCX', scope: 'Stenotic vs. normal LCX label from the source cohort.' },
  { code: 'RCA', name: 'Right coronary artery', short: 'RCA', scope: 'Stenotic vs. normal RCA label from the source cohort.' },
];
/** Sequential single-hue ramp (low -> high model score). Deliberately not red/green. */
export const SCORE_RAMP = ['#22485b', '#276d86', '#2c93a8', '#33b9b3', '#74dcc9'];
export function scoreColor(score: number): string {
  const s = Math.min(1, Math.max(0, score)) * (SCORE_RAMP.length - 1);
  const i = Math.min(SCORE_RAMP.length - 2, Math.floor(s));
  const t = s - i;
  const a = parseInt(SCORE_RAMP[i].slice(1), 16), b = parseInt(SCORE_RAMP[i + 1].slice(1), 16);
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}
