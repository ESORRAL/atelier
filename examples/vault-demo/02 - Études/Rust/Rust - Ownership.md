# Rust - Ownership

Trois règles à retenir :
1. Chaque valeur a **un seul propriétaire**
2. Quand le propriétaire sort de la portée, la valeur est libérée
3. On peut **emprunter** une valeur (`&` ou `&mut`), mais jamais les deux en même temps

C'est ce qui évite les erreurs mémoire sans ramasse-miettes. Voir aussi [[Rust - Les bases]].
