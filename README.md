# LuCiPortfolio

Application web Google Apps Script pour gérer un carnet de contacts culturels et les spectacles associés. Les données sont stockées dans le Google Sheet auquel le projet Apps Script est lié.

## Mise en place

1. Synchroniser les fichiers avec `clasp push --force` ou ajouter `Code.js`, `Index.html` et `appsscript.json` au projet Apps Script.
2. Dans Apps Script, choisir **Déployer → Nouveau déploiement → Application Web**, puis déployer.
3. Ouvrir l’URL de l’application web. Si aucun Sheet n’est déjà lié, l’écran de démarrage demande l’URL ou l’identifiant du fichier de données.
4. Autoriser l’accès au Google Sheet quand Google le demande.

L’application est configurée pour le compte qui la déploie uniquement (`MYSELF`) et s’exécute avec les autorisations du déployeur. Au premier chargement, elle crée les onglets `Contacts`, `Spectacles` et `Listes emails`, avec leurs en-têtes. Pour utiliser un projet lié à un Sheet, ouvrez-le depuis **Extensions → Apps Script** ; il se connecte automatiquement à ce fichier.

## Documentation technique

Les parcours utilisateur et les chaînes d’appels jusqu’aux accès Google Sheets sont décrits dans [docs/parcours-utilisateur.adoc](docs/parcours-utilisateur.adoc). Le document inclut des diagrammes Mermaid en syntaxe AsciiDoc.

## Données gérées

- **Contacts** : identité, coordonnées, ville, département, structure, publics programmés, commentaires et note. Les spectacles vus et programmés sont conservés par identifiant de spectacle.
- **Spectacles** : titre, compagnie, catégorie et commentaires.
- **Listes emails** : une ligne par adresse exportée, avec le nom de la liste, sa date de création et la colonne **email google**.

Les sélections d’emails ignorent les adresses invalides et les doublons. Les listes précédentes sont conservées dans l’onglet.

## Import depuis un autre Google Sheet

Dans l’application, ouvrir **Importer**, coller l’URL ou l’identifiant du fichier, indiquer le nom de l’onglet et préciser si la première ligne contient des en-têtes. Les colonnes reconnues sont `note`, `company`, `Civilité`/`Civilte`, `Prénom`, `Nom`, `Commentaires`, `Email`, `Ville`, `Département`, `Téléphone` et `Spectacle vus ou programmé`.

Sans en-têtes, l’import attend cet ordre de colonnes : note, company, Civilité, Prénom, Nom, Commentaires, Email, Ville, Département, Téléphone, spectacles. Les spectacles de la colonne séparée par des virgules sont ajoutés au catalogue s’ils n’existent pas. L’application demande s’ils doivent être associés comme vus ou programmés. Un contact ayant déjà la même adresse email est mis à jour ; les champs vides de la source conservent les valeurs existantes.

L’import lit le fichier source avec le compte qui exécute l’application. Ce compte doit avoir accès aux deux Google Sheets.
