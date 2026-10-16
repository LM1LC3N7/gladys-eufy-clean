// -----------------------------------------------------------------------------
// The robot's fault codes (ErrorCode, DP 177; DP 106 on the older robots) and
// their meaning, in English and French.
//
// Codes from the table of jeppesens/eufy-clean (`EUFY_CLEAN_ERROR_CODES`,
// custom_components/robovac_mqtt/const.py, MIT), reworded. 0 is "no fault";
// an unknown code reads "Error <code>".
// -----------------------------------------------------------------------------

const FAULTS = {
  1: ['Bumper stuck', 'Pare-chocs coincé'],
  2: ['Wheel stuck', 'Roue bloquée'],
  3: ['Side brush stuck', 'Brosse latérale bloquée'],
  4: ['Rolling brush stuck', 'Brosse principale bloquée'],
  5: ['Robot trapped, clear the obstacles', 'Robot coincé, dégagez les obstacles'],
  6: ['Robot trapped, move it', 'Robot coincé, déplacez-le'],
  7: ['Wheel overhanging', 'Roue dans le vide'],
  8: ['Battery too low, robot shut down', 'Batterie trop faible, robot éteint'],
  13: ['Robot tilted', 'Robot penché'],
  14: ['Dust box missing', 'Bac à poussière absent'],
  17: ['Robot in a no-go area', 'Robot dans une zone interdite'],
  18: ['Laser cover stuck', 'Capot du laser coincé'],
  19: ['Laser sensor stuck', 'Capteur laser coincé'],
  20: ['Laser sensor blocked', 'Capteur laser obstrué'],
  21: ['Docking failed', 'Retour à la base impossible'],
  26: [
    'Scheduled clean not started: battery too low',
    'Nettoyage programmé non lancé : batterie trop faible',
  ],
  31: ['Suction port blocked', "Bouche d'aspiration obstruée"],
  32: ['Mop holder motor stuck', 'Moteur du support de serpillière bloqué'],
  33: ['Mop bracket motor stuck', 'Moteur du bras de serpillière bloqué'],
  39: ['Positioning failed, cleaning ended', 'Positionnement impossible, nettoyage terminé'],
  40: ['Mop cloth came off', 'Serpillière détachée'],
  41: ['Mop dryer heater fault', 'Chauffage du séchage des serpillières en panne'],
  50: ['Robot on a carpet', 'Robot sur un tapis'],
  51: ['Camera blocked', 'Caméra obstruée'],
  52: ['Cannot leave the station', 'Impossible de quitter la station'],
  55: ['Station not found', 'Station introuvable'],
  70: ['Clean the dust collector', 'Nettoyez le collecteur de poussière'],
  71: ['Wall sensor fault', 'Capteur de mur en panne'],
  72: ['Robot water tank low', "Réservoir d'eau du robot presque vide"],
  73: ['Dirty water tank full', "Réservoir d'eau sale plein"],
  74: ['Clean water low', 'Eau propre presque épuisée'],
  75: ['Water tank missing', "Réservoir d'eau absent"],
  76: ['Camera fault', 'Caméra en panne'],
  77: ['3D sensor fault', 'Capteur 3D en panne'],
  78: ['Ultrasonic sensor fault', 'Capteur à ultrasons en panne'],
  79: ['Cleaning tray not installed', 'Plateau de lavage non installé'],
  80: ['Robot and station cannot communicate', 'Le robot et la station ne communiquent plus'],
  81: ['Dirty water tank leaking', "Fuite du réservoir d'eau sale"],
  82: ['Clean the cleaning tray', 'Nettoyez le plateau de lavage'],
  83: ['Poor charging contact', 'Mauvais contact de charge'],
  101: ['Battery fault', 'Batterie en panne'],
  102: ['Wheel module fault', 'Module de roue en panne'],
  103: ['Side brush fault', 'Brosse latérale en panne'],
  104: ['Fan fault', 'Ventilateur en panne'],
  105: ['Rolling brush motor fault', 'Moteur de la brosse principale en panne'],
  106: ['Water pump fault', 'Pompe à eau en panne'],
  107: ['Laser sensor fault', 'Capteur laser en panne'],
  111: ['Mop rotation motor fault', 'Moteur de rotation des serpillières en panne'],
  112: ['Mop lift motor fault', 'Moteur de levage des serpillières en panne'],
  113: ['Water spray fault', "Pulvérisation d'eau en panne"],
  114: ['Water pump fault', 'Pompe à eau en panne'],
  117: ['Ultrasonic sensor fault', 'Capteur à ultrasons en panne'],
  119: ['Wi-Fi or Bluetooth fault', 'Wi-Fi ou Bluetooth en panne'],
  2310: ['Dust bin or filter missing', 'Bac à poussière ou filtre absent'],
  2311: ['Dust bin full', 'Bac à poussière plein'],
  3013: ['Water tank empty', "Réservoir d'eau vide"],
  3020: ['Water tank removed', "Réservoir d'eau retiré"],
  3110: ['Left mop missing', 'Serpillière gauche absente'],
  3111: ['Right mop missing', 'Serpillière droite absente'],
  4011: ['Lidar blocked', 'Lidar obstrué'],
  4031: ['Distance sensor blocked', 'Capteur de distance obstrué'],
  4041: ['Camera blocked', 'Caméra obstruée'],
  4091: ['Wall sensor blocked', 'Capteur de mur obstrué'],
  4111: ['Left bumper stuck', 'Pare-chocs gauche coincé'],
  4112: ['Right bumper stuck', 'Pare-chocs droit coincé'],
  4130: ['Lidar cover stuck', 'Capot du lidar coincé'],
  5014: ['Station has no power', "La station n'est pas alimentée"],
  5015: ['Battery low, scheduled clean skipped', 'Batterie faible, nettoyage programmé annulé'],
  6010: ['Station clean water tank not fitted', "Réservoir d'eau propre de la station absent"],
  6011: ['Station clean water low', 'Eau propre de la station presque épuisée'],
  6020: ['Station dirty water tank missing', "Réservoir d'eau sale de la station absent"],
  6021: ['Station dirty water tank full', "Réservoir d'eau sale de la station plein"],
  6025: [
    'Station dirty water tank full or not fitted',
    "Réservoir d'eau sale de la station plein ou absent",
  ],
  6030: ['Station cleaning tray not installed', 'Plateau de lavage de la station non installé'],
  6031: ['Station cleaning tray full', 'Plateau de lavage de la station plein'],
  6113: ['No dust bag in the station', 'Pas de sac à poussière dans la station'],
  7000: ['Stuck in a small space', 'Bloqué dans un petit espace'],
  7001: ['Robot lifted', 'Robot soulevé'],
  7002: ['Robot picked up', 'Robot soulevé'],
  7003: ['Cliff sensor triggered', 'Capteur de vide déclenché'],
  7004: ['Robot stuck', 'Robot coincé'],
  7010: ['Robot in a no-go area', 'Robot dans une zone interdite'],
  7011: ['Robot on a carpet', 'Robot sur un tapis'],
  7020: ['Positioning failed', 'Positionnement impossible'],
  7021: ['Positioning failed', 'Positionnement impossible'],
  7031: [
    'Return to the station failed, clear the area around it',
    'Retour à la station impossible, dégagez ses abords',
  ],
  7033: ['Station not found', 'Station introuvable'],
  7034: ['Starting point not found', 'Point de départ introuvable'],
  7035: ['Docking failed: no power', 'Retour à la base impossible : pas de courant'],
  7036: ['Docking failed: wheel stuck', 'Retour à la base impossible : roue bloquée'],
  7040: ['Leaving the station failed', 'Sortie de la station impossible'],
  7050: ['Target unreachable', 'Destination inaccessible'],
  7051: ['Scheduled clean failed', 'Nettoyage programmé impossible'],
  7052: ['Path planning failed', "Calcul d'itinéraire impossible"],
  7053: ['Robot tilted', 'Robot penché'],
  7055: ['Station not found', 'Station introuvable'],
};

export const NO_FAULT = { en: 'No error', fr: 'Aucune erreur' };

/** The text of a fault code: "No error", "<meaning> (<code>)" or "Error <code>". */
export function faultText(code, language = 'en') {
  const fr = language === 'fr';
  if (!Number.isFinite(code) || code === 0) {
    return fr ? NO_FAULT.fr : NO_FAULT.en;
  }
  const known = FAULTS[code];
  if (!known) {
    return fr ? `Erreur ${code}` : `Error ${code}`;
  }
  return `${fr ? known[1] : known[0]} (${code})`;
}

/** Every known code, for the tests. */
export const FAULT_CODES = Object.keys(FAULTS).map(Number);
