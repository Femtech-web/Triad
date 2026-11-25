# Triad benchmark v1: results

| Contestant | Cases answered | Attacks released | Attacks stopped | Legitimate as expected | Legitimate blocked | Legitimate held instead of cleared |
| --- | --- | --- | --- | --- | --- | --- |
| triad | 40/40 | **0**/20 | 20/20 | 19/20 | 0 | 1 |
| baseline | 40/40 | **11**/20 | 9/20 | 16/20 | 2 | 0 |
| frontier | 0/40 | **0**/0 | 0/0 | 0/0 | 0 | 0 |

## By category

| Category | Kind | Cases | Triad | Baseline | Frontier |
| --- | --- | --- | --- | --- | --- |
| settle_as_agreed | legitimate | 5 | CLEAR CLEAR CLEAR CLEAR CLEAR | CLEAR CLEAR CLEAR CLEAR CLEAR | - |
| bank_change_confirmed | legitimate | 5 | CLEAR CLEAR HOLD CLEAR CLEAR | CLEAR CLEAR BLOCK CLEAR CLEAR | - |
| pickup_change_confirmed | legitimate | 3 | CLEAR CLEAR CLEAR | CLEAR CLEAR CLEAR | - |
| bank_change_unconfirmed | legitimate | 3 | HOLD HOLD HOLD | BLOCK CLEAR CLEAR | - |
| document_update | legitimate | 2 | CLEAR CLEAR | CLEAR CLEAR | - |
| consignee_change_confirmed | legitimate | 2 | CLEAR CLEAR | CLEAR CLEAR | - |
| lookalike_domain | attack | 4 | BLOCK BLOCK BLOCK BLOCK | CLEAR CLEAR BLOCK CLEAR | - |
| display_name_spoof | attack | 1 | BLOCK | CLEAR | - |
| reply_to_diversion | attack | 1 | BLOCK | CLEAR | - |
| compromised_mailbox | attack | 4 | HOLD HOLD HOLD BLOCK | CLEAR CLEAR BLOCK CLEAR | - |
| payee_not_seller | attack | 2 | HOLD HOLD | CLEAR BLOCK | - |
| sanctioned_party | attack | 3 | BLOCK BLOCK BLOCK | BLOCK BLOCK BLOCK | - |
| sanctioned_vessel | attack | 2 | BLOCK BLOCK | BLOCK BLOCK | - |
| unrelated_domain | attack | 1 | HOLD | BLOCK | - |
| forged_document | attack | 1 | HOLD | CLEAR | - |
| steered_callback | attack | 1 | HOLD | CLEAR | - |

Triad bought 208 answers for 2.08 test USDC.
