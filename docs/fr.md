# eufy Clean

Cette intégration amène les **aspirateurs robots eufy** (RoboVac, eufy Clean :
séries X, L, G, C…) dans Gladys, par le cloud eufy (celui de l'application
eufy) : état, batterie, nettoyage, pause, retour à la base, type de nettoyage,
puissance d'aspiration, usure des brosses, du filtre et de la serpillière,
erreurs, et des déclencheurs de scène. Les mises à jour arrivent en temps réel
par le MQTT sécurisé d'eufy. Non officielle, sans lien avec Anker ni eufy.

> **Version de développement (0.1).** Construite sur le SDK communautaire
> [@mega-yfue/eufy-sdk](https://github.com/mega-yfue/eufy-sdk) et testée avec
> des robots simulés, pas encore avec un vrai robot. Vos retours sont les
> bienvenus sur le dépôt GitHub.

**Hors périmètre** : les caméras, sonnettes vidéo, serrures, capteurs et
HomeBase eufy. Ils relèvent de l'intégration **eufy Security** du store Gladys
(cicoub13/gladys-eufy) ; celle-ci les ignore et ne s'y connecte jamais. Les
**tondeuses** robots eufy ne sont pas encore prises en charge.

## Quel compte

Utilisez l'adresse e-mail et le mot de passe de votre compte de
l'**application eufy**, et le **pays** choisi à sa création (FR, BE, CH, GB,
DE, US…).

- L'intégration se connecte comme son propre « téléphone », différent de
  l'application eufy et de l'intégration eufy Security : aucune ne devrait
  déconnecter les autres. Si l'application eufy ou Gladys se fait quand même
  déconnecter sans cesse, créez un **second compte eufy**, partagez-lui le
  robot depuis l'application eufy (robot → réglages → partager) et donnez ce
  second compte à Gladys.
- Un compte qui se connecte avec Google ou Apple n'a pas de mot de passe :
  ajoutez-en un dans l'application eufy, ou utilisez un second compte.

## Installation

1. Installez l'intégration depuis le store Gladys.
2. Dans l'onglet **Configuration**, saisissez l'adresse e-mail, le mot de
   passe et le pays du compte eufy. Enregistrez.
3. À la première connexion, eufy envoie en général un **code de
   vérification** (par e-mail ou dans l'application) : l'état de la connexion
   l'indique. Saisissez le code dans **Code de vérification** et enregistrez.
   Le champ se vide tout seul ; la session est ensuite gardée dans le dossier
   `/data` de l'intégration, un redémarrage ne redemande pas de code.
4. L'état indique « Connecté à eufy : 1 robot ».
5. Ouvrez l'onglet **Découverte** et ajoutez vos robots. Leurs valeurs
   arrivent dès l'ajout, quand le robot donne des nouvelles (un robot sur sa
   base peut rester silencieux tant que rien ne change).

### Le captcha, si eufy en demande un

Après plusieurs connexions ratées, eufy peut demander un **captcha**. L'écran
de configuration de Gladys ne sait pas afficher une image : l'intégration
l'écrit donc dans ses **journaux**, sur une ligne qui commence par
`data:image/png;base64,`. Copiez toute la ligne, collez-la dans la barre
d'adresse de votre navigateur pour voir l'image, saisissez ses 4 caractères
dans **Réponse au captcha** et enregistrez. Une mauvaise réponse amène une
nouvelle image dans les journaux.

Le bouton **Tester la connexion** affiche le compte, chaque robot avec son état
et sa batterie, et si le canal temps réel est connecté.

## Ce que vous obtenez

Un appareil Gladys par aspirateur robot, avec les fonctionnalités que le robot
signale ou les commandes que le SDK confirme pour lui :

| Fonctionnalité                     | Dans Gladys                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| État                               | Arrêté, En cours, En pause, Erreur, Retour à la base, En charge, Sur la base                                                        |
| Nettoyage (mode de fonctionnement) | **Nettoyer** lance un nettoyage (ou reprend celui en pause), **Pause** le met en pause                                              |
| Retour à la base                   | renvoie le robot sur sa base                                                                                                        |
| Type de nettoyage                  | robots avec serpillière : **Auto** (aspiration et serpillière), **Aspiration**, **Serpillière**                                     |
| Puissance d'aspiration             | Silencieux, Standard, Turbo, Max, et BoostIQ ou Max Pro quand le robot les propose                                                  |
| Batterie, En charge                | niveau de batterie en %, en charge sur sa base                                                                                      |
| Erreur, Code d'erreur              | le message (« Roue bloquée (2) », « Aucune erreur ») et le code, pour les scènes                                                    |
| Consommables (entretien)           | durée de vie restante en % de la brosse latérale, de la brosse principale, du filtre, de la serpillière, des capteurs et du plateau |
| Surface nettoyée, Durée            | du nettoyage en cours ou du dernier (m², minutes)                                                                                   |
| Localiser le robot                 | fait biper le robot                                                                                                                 |

- Les fonctionnalités suivent le robot : un robot sans serpillière n'a pas de
  type de nettoyage, une pièce que le robot ne compte pas n'a pas de
  fonctionnalité. Une fonctionnalité signalée plus tard est ajoutée : mettez
  l'appareil à jour depuis l'onglet **Découverte** pour l'obtenir.
- **Consommables** : le robot compte les heures de travail de chaque pièce ;
  l'intégration en déduit une durée de vie restante, avec les durées utilisées
  par l'intégration Home Assistant (brosse latérale 180 h, brosse principale
  360 h, filtre 360 h, serpillière 180 h ; capteurs à nettoyer toutes les 60 h,
  plateau toutes les 30 h). La remise à zéro après un remplacement se fait dans
  l'application eufy.
- **Pas de « stop »** : le SDK n'a pas encore confirmé la commande d'arrêt
  d'eufy. **Pause** puis **Retour à la base** termine un nettoyage.
- Le badge de chaque appareil indique `cloud`, ou `injoignable` quand eufy
  signale le robot hors ligne.
- **Robots plus anciens** (série G, L60, X8 et les autres robots de la gamme
  « eufy Home ») : le SDK lit leur état, leur batterie et leurs erreurs mais n'a
  pas encore de commande confirmée pour eux ; le bouton de test les marque
  « lecture seule ».

## Scènes

Deux déclencheurs de scène, chacun peut viser un robot :

- **Nettoyage terminé** : le robot est revenu sur sa base (ou s'est arrêté)
  après un nettoyage. Variables `robot_name`, `duration` (minutes) et `area`
  (m²). Pas déclenché quand le nettoyage s'est arrêté sur une erreur.
- **Erreur du robot** : le robot signale une nouvelle erreur (roue ou brosse
  bloquée, bac à poussière plein, réservoir vide, robot coincé…). Variables
  `robot_name`, `error_code` et `error_message`. Déclenché une fois par
  nouveau code.

La première lecture après un démarrage ne déclenche rien. Les commandes sont
les actions habituelles « Contrôler un appareil » (Nettoyage : Nettoyer /
Pause, Retour à la base, Puissance d'aspiration…), et les autres valeurs
fonctionnent avec le déclencheur « Changement d'état d'un appareil ».

## Fonctionnement

L'intégration se connecte au cloud eufy comme l'application, lit les appareils
du compte (toutes les 10 minutes, pour voir un robot ajouté ou retiré) et garde
une connexion MQTT sécurisée ouverte : les robots y signalent leurs
changements et les commandes y passent. Aucune interrogation périodique des
robots. Si la connexion tombe, elle revient d'elle-même ; si eufy termine la
session, l'intégration se reconnecte après le délai qu'eufy demande (une
minute au moins).

## Options

| Option                                   | Défaut   | Rôle                                                              |
| ---------------------------------------- | -------- | ----------------------------------------------------------------- |
| Adresse e-mail, mot de passe eufy        | —        | le compte de l'application eufy (ou un second compte)             |
| Pays du compte                           | FR       | deux lettres, le pays de création du compte                       |
| Code de vérification, Réponse au captcha | vides    | seulement quand eufy les demande (voir l'état de la connexion)    |
| Langue des noms des fonctionnalités      | Français | noms des fonctionnalités, niveaux d'aspiration, messages d'erreur |

## Dépannage

- **« eufy a refusé la connexion »** : vérifiez l'e-mail, le mot de passe et
  le pays dans l'application eufy. L'intégration ne réessaie pas seule : elle
  attend une modification de la configuration.
- **« eufy a envoyé un code de vérification »** : saisissez le code reçu par
  e-mail (ou dans l'application) dans **Code de vérification** et enregistrez,
  dans les minutes qui suivent.
- **« eufy demande un captcha »** : voir plus haut ; l'image est dans les
  journaux.
- **« La session eufy s'est terminée »** : une autre application s'est
  connectée avec le même compte et la même identité, ou la session a expiré.
  L'intégration se reconnecte seule ; si cela se répète, utilisez un second
  compte avec lequel le robot est partagé.
- **« le canal temps réel eufy (MQTT) ne s'est pas ouvert »** : les robots ne
  peuvent pas donner de nouvelles. L'intégration réessaie (1 minute, puis plus
  longtemps) ; vérifiez que Gladys accède à Internet.
- **Un robot n'a pas d'état** : il ne signale que les changements ; lancez un
  nettoyage ou posez-le sur sa base, l'état suit.
- **Un robot est en « lecture seule »** : un modèle plus ancien ; ses commandes
  viendront avec le SDK.

## Confidentialité

L'e-mail et le mot de passe sont stockés par Gladys comme un secret (jamais
renvoyé au navigateur). L'intégration les envoie, chiffrés comme le fait
l'application, au cloud eufy de la région du compte pour ouvrir une session,
et garde la session dans son dossier `/data`. Elle ne s'abonne pas aux
notifications des caméras et n'ouvre aucune connexion aux caméras ni aux
HomeBase. eufy, Anker, RoboVac et BoostIQ sont des marques de leur
propriétaire ; cette intégration est sans lien avec Anker ni eufy.
