# SlimCoach — première version testable

Application web (français, mobile d’abord, vert et blanc) pour gérer son poids de façon saine :
profil, suivi du poids avec courbe, habitudes (eau, sommeil, activité), repas équilibrés, exercices à la maison,
accès gratuit limité + Premium en paiement unique, administration des contenus.

Aucune dépendance externe : Node.js ≥ 22.13 (SQLite intégré). Pas de `npm install` nécessaire.

## Lancer en local

```bash
npm start            # http://localhost:3000
npm test             # 14 tests automatiques de l’API
```

En développement, au premier démarrage :
- un compte démo : `demo@slimcoach.test` / `Demo-2026-Slim` ;
- un compte administrateur : `admin@slimcoach.test` dont le mot de passe aléatoire est affiché une seule fois dans la console ;
- sur la page Premium, un bouton “mode test” qui débloque Premium sans paiement.

## Ce qui est réellement fonctionnel et testé

- Comptes, connexion, déconnexion
- Profil avec validation
- Suivi du poids, courbe, historique
- Habitudes, objectifs modifiables, calendrier
- Repas / exercices, filtre profil et budget
- Séparation gratuit / Premium
- Administration
- Export et suppression du compte
- Parcours complet sur navigateur mobile/desktop

## Ce qui n’est pas opérationnel

1. Paiement réel non intégré.
2. Hébergement HTTPS non fourni.
3. Sauvegarde SQLite non configurée.
4. Mot de passe oublié / vérification e-mail absent.
5. Le contenu santé doit être relu par un professionnel avant lancement public.

## Variables d’environnement

Voir `.env.example`.
