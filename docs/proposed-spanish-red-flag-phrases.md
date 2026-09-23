# Proposed Spanish red-flag phrases — for the owner, a clinician and a translator

Drafted 2026-09-22.

⛔ **NOTHING HERE HAS BEEN APPLIED.** `emergency.py` is fenced by CLAUDE.md, and
an agent that believes a red-flag list needs changing must stop and report it.
This file is that report. It is also the blocker on the Spanish interface: see
`mobile/src/i18n/strings.ts`, which ships with Spanish switched off until this
list is ruled on and in place.

## Why it matters

Measured on `main`: "dolor de pecho" (chest pain) and "no puedo respirar"
(I can't breathe) match no rule and fall to the URGENT default — no
instruction to call anyone. Screening is English-only, so a Spanish-speaking
person describing an emergency in Spanish gets the same answer as someone
describing a mild ache in words the lists do not know. About 41 million people
in the US speak Spanish at home.

## What the change would be

Each phrase below would be added to an **existing** category in
`_EMERGENCY_RULES`. No category added, no headline or action changed, no number
changed. The copy shown would still be the reviewed English copy — which is
itself a problem for a reader who does not read English, and is question 3
below.

This is one-directional in the same way every other addition to that file is:
a phrase can only make screening more sensitive.

Matching needs one mechanical change too: `normalize_query` should fold accents
(`respiración` / `respiracion`) because people type without them on phones.
Folding can only add matches.

## The phrases

Everyday wording, both formal and informal, with and without accents.

| Category | Proposed phrases |
|---|---|
| cardiac | dolor de pecho, dolor en el pecho, me duele el pecho, presión en el pecho, opresión en el pecho, ataque al corazón, infarto |
| breathing | no puedo respirar, me falta el aire, falta de aire, me ahogo, dificultad para respirar, no está respirando, se está ahogando, labios morados |
| stroke | derrame, derrame cerebral, embolia, cara caída, se le cayó la cara, no puede hablar bien, habla arrastrada, no puedo mover el brazo, debilidad de un lado |
| bleeding_trauma | no para de sangrar, sangra mucho, hemorragia, me pegué en la cabeza, se golpeó la cabeza, vomité sangre, heces negras |
| anaphylaxis | se me cierra la garganta, se me hincha la lengua, reacción alérgica grave, se le hincha la cara |
| consciousness | se desmayó, me desmayé, no despierta, inconsciente, convulsión, convulsiones, está convulsionando |
| self_harm | quiero morir, me quiero matar, quiero suicidarme, suicidio, no quiero vivir, hacerme daño |
| vision_loss | perdí la vista, no veo de un ojo, se me nubló un ojo de repente |
| sepsis_meningitis | cuello rígido y fiebre, manchas que no desaparecen al presionar |
| infant_fever | bebé con fiebre, mi bebé tiene fiebre, recién nacido con fiebre |
| pregnancy | embarazada y sangrando, sangrado en el embarazo, se me rompió la fuente |
| overdose_poisoning | sobredosis, tomé demasiadas pastillas, se tomó unas pastillas, tomó cloro, envenenamiento, se tomó el detergente |

## Questions only a person can answer

1. Is each phrase genuinely a description of its category, in the dialects
   the app's users speak? Strike anything that is not.
2. Are any too broad? "me ahogo" is also said about anxiety and heat. The
   English list excluded "out of breath" for this reason.
3. **What should the emergency guidance say to someone who wrote in Spanish?**
   Showing the reviewed English copy is safe in the sense that "911" reads the
   same in both languages, and unsafe in every other sense. A Spanish
   translation of the copy is new escalation copy and needs the same review
   the English had. This is the decision the Spanish interface really waits on.
4. Should the Spanish interface ask people to write in English until this is
   done? That is honest and unfriendly; it is the alternative to shipping
   nothing.
