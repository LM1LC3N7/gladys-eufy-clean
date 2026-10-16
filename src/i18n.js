// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, test button, feature names, option
// labels), in English and French.
// -----------------------------------------------------------------------------

/** The text of `texts` in `language`, English otherwise. */
export const word = (texts, language) => texts[language] ?? texts.en;

/** Feature names, in the language chosen in the configuration. */
export const FEATURE_NAMES = {
  state: { en: 'State', fr: 'État' },
  'run-mode': { en: 'Cleaning', fr: 'Nettoyage' },
  'clean-mode': { en: 'Cleaning type', fr: 'Type de nettoyage' },
  dock: { en: 'Return to dock', fr: 'Retour à la base' },
  suction: { en: 'Suction power', fr: "Puissance d'aspiration" },
  battery: { en: 'Battery', fr: 'Batterie' },
  charging: { en: 'Charging', fr: 'En charge' },
  error: { en: 'Error', fr: 'Erreur' },
  'error-code': { en: 'Error code', fr: "Code d'erreur" },
  'side-brush': { en: 'Side brush', fr: 'Brosse latérale' },
  'rolling-brush': { en: 'Rolling brush', fr: 'Brosse principale' },
  filter: { en: 'Filter', fr: 'Filtre' },
  mop: { en: 'Mop', fr: 'Serpillière' },
  sensors: { en: 'Sensors (cleaning)', fr: 'Capteurs (nettoyage)' },
  scraper: { en: 'Cleaning tray (cleaning)', fr: 'Plateau de lavage (nettoyage)' },
  'clean-area': { en: 'Area cleaned', fr: 'Surface nettoyée' },
  'clean-duration': { en: 'Cleaning time', fr: 'Durée du nettoyage' },
  locate: { en: 'Find my robot', fr: 'Localiser le robot' },
};

export const featureName = (role, language) => word(FEATURE_NAMES[role], language);

/** Labels of the run-mode options (Gladys shows its own translation first). */
export const RUN_MODE_NAMES = {
  0: { en: 'Pause', fr: 'Pause' },
  1: { en: 'Clean', fr: 'Nettoyer' },
};

/** Labels of the clean-mode options. */
export const CLEAN_MODE_NAMES = {
  0: { en: 'Vacuum and mop', fr: 'Aspiration et serpillière' },
  5: { en: 'Vacuum', fr: 'Aspiration' },
  6: { en: 'Mop', fr: 'Serpillière' },
};

/** Labels of the suction levels (`text`/`select` options: the label is shown). */
export const SUCTION_NAMES = {
  quiet: { en: 'Quiet', fr: 'Silencieux' },
  standard: { en: 'Standard', fr: 'Standard' },
  turbo: { en: 'Turbo', fr: 'Turbo' },
  max: { en: 'Max', fr: 'Max' },
  boost_iq: { en: 'BoostIQ', fr: 'BoostIQ' },
  max_pro: { en: 'Max Pro', fr: 'Max Pro' },
};

/** The device name when eufy gives none. */
export const ROBOT_NAME = { en: 'eufy robot vacuum', fr: 'Aspirateur robot eufy' };

/** Connection status messages. */
export const STATUS = {
  missing: {
    en: 'Enter the e-mail address and password of your eufy account, then save.',
    fr: 'Saisissez l’adresse e-mail et le mot de passe de votre compte eufy, puis enregistrez.',
  },
  badCountry: {
    en: 'The country must be a two-letter code, such as FR, BE, CH or GB.',
    fr: 'Le pays doit être un code à deux lettres, comme FR, BE, CH ou GB.',
  },
  connecting: { en: 'Signing in to eufy…', fr: 'Connexion à eufy…' },
  captcha: {
    en: 'eufy asks for a captcha: open the integration logs, paste the line starting with data:image into your browser, type the 4 characters in "Captcha answer" and save.',
    fr: 'eufy demande un captcha : ouvrez les journaux de l’intégration, collez la ligne qui commence par data:image dans votre navigateur, saisissez les 4 caractères dans « Réponse au captcha » et enregistrez.',
  },
  captchaRetry: {
    en: 'Wrong captcha answer: a new image is in the logs. Type its 4 characters in "Captcha answer" and save.',
    fr: 'Mauvaise réponse au captcha : une nouvelle image est dans les journaux. Saisissez ses 4 caractères dans « Réponse au captcha » et enregistrez.',
  },
  code: {
    en: 'eufy sent a verification code (e-mail or app): type it in "Verification code" and save.',
    fr: 'eufy a envoyé un code de vérification (e-mail ou application) : saisissez-le dans « Code de vérification » et enregistrez.',
  },
  codeRefused: {
    en: 'eufy refused the verification code. A new one is on its way: type it in "Verification code" and save.',
    fr: 'eufy a refusé le code de vérification. Un nouveau code arrive : saisissez-le dans « Code de vérification » et enregistrez.',
  },
  refused: {
    en: 'eufy refused the sign-in: check the e-mail address, the password and the country, then save.',
    fr: 'eufy a refusé la connexion : vérifiez l’adresse e-mail, le mot de passe et le pays, puis enregistrez.',
  },
  retrying: (minutes) => ({
    en: `eufy cannot be reached, next try in ${minutes} min.`,
    fr: `eufy est injoignable, nouvel essai dans ${minutes} min.`,
  }),
  sessionEnded: (minutes) => ({
    en: `The eufy session ended (another app may use the same account and phone identity), new sign-in in ${minutes} min.`,
    fr: `La session eufy s’est terminée (une autre application utilise peut-être le même compte et la même identité), nouvelle connexion dans ${minutes} min.`,
  }),
  connected: (robots) => ({
    en: `Connected to eufy: ${robots} robot${robots === 1 ? '' : 's'}.`,
    fr: `Connecté à eufy : ${robots} robot${robots === 1 ? '' : 's'}.`,
  }),
  noRealtime: {
    en: 'Signed in, but the eufy real-time channel (MQTT) did not open: the robots will update once it does (retrying).',
    fr: 'Connecté, mais le canal temps réel eufy (MQTT) ne s’est pas ouvert : les robots se mettront à jour dès qu’il s’ouvrira (nouvel essai).',
  },
};

/** Test button. */
export const TEST = {
  title: { en: 'eufy account', fr: 'Compte eufy' },
  notConnected: { en: 'Not connected', fr: 'Non connecté' },
  robots: { en: 'Robots', fr: 'Robots' },
  none: {
    en: 'no robot vacuum on this account',
    fr: 'aucun aspirateur robot sur ce compte',
  },
  ignored: (count) => ({
    en: `${count} other eufy device${count === 1 ? '' : 's'} ignored (cameras, locks… are for the eufy Security integration)`,
    fr: `${count} autre${count === 1 ? '' : 's'} appareil${count === 1 ? '' : 's'} eufy ignoré${count === 1 ? '' : 's'} (caméras, serrures… : intégration eufy Security)`,
  }),
  realtime: { en: 'Real time (MQTT)', fr: 'Temps réel (MQTT)' },
  realtimeUp: { en: 'connected', fr: 'connecté' },
  realtimeDown: { en: 'not connected', fr: 'non connecté' },
  readOnly: { en: 'read only', fr: 'lecture seule' },
  waiting: { en: 'no report yet', fr: 'pas encore de nouvelles' },
};

/** Names of the robot activities, for the test button. */
export const ACTIVITY_NAMES = {
  idle: { en: 'stopped', fr: 'arrêté' },
  error: { en: 'error', fr: 'erreur' },
  docked: { en: 'docked', fr: 'sur la base' },
  charging: { en: 'charging', fr: 'en charge' },
  cleaning: { en: 'cleaning', fr: 'nettoyage' },
  returning: { en: 'returning to dock', fr: 'retour à la base' },
  paused: { en: 'paused', fr: 'en pause' },
};

/** Command errors (the message shown when Gladys cannot run a command). */
export const COMMAND_ERRORS = {
  notConnected: 'eufy is not connected',
  unknownRobot: 'unknown robot',
  unsupported: 'this robot does not support this command through the eufy SDK',
  badValue: 'unsupported value',
};
