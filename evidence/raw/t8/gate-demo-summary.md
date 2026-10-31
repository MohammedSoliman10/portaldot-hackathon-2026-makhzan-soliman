# Live StorageGate Demo Summary (Part 1 & Part 2)

- Target Chain: Portaldot V3 Testnet (`chainId: 420420777`)
- Makhzan Contract: `0x60481DFcFCA34A8F095939D9675eC715127B2e44`
- StorageGate Contract: `0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA`
- Owner Address: `0x0948EBD7637D1C32858a6FC5D947E85A6600205C`
- Provider-1 Address: `0xf4ec143c743FF57c0D32e829f50692551CBf6029`

## Live Transactions (11 Total)

1. `createDeal(3)`: tx `0x196d1ab6b059441ad92a17e83d98b5da2f8fa8c223ed6f79a42df238284689ee`, block 250092, duration 600 blocks (endBlock 250692), price 5 tPOT (500000000000000 units), fee 11.557013864671672935 tPOT (11.557014 tPOT).
2. `createDeal(4)`: tx `0x853225285c317dc91de4ecc9aee61be950fad7801ea64fcf25d79710d1104761`, block 252512, duration 3000 blocks (endBlock 255512), price 5 tPOT (500000000000000 units), fee 11.557013787572357160 tPOT (11.557014 tPOT).
3. `gate:lock(4)`: tx `0x3719248237ec37c916b11e3d014aebba05d84cedcdcdc79cc1b9feaa18a62203`, block 252523, amount 2 tPOT (2000000000000000 units), minBond 20 tPOT (2000000000000000 units), fee 7.705815451390486845 tPOT (7.705815 tPOT).
4. `gate:release(4)`: tx `0x4c63d339e7db1cfa9ef7b48194d38f6b2c2613f60d6cf0d3d3c6afbbc6d35c3f`, block 252535, released 2 tPOT to provider-1, fee 0.015322010475905210 tPOT (0.015322 tPOT).
5. `createDeal(5)`: tx `0x12557be0d42359a70cbb22acd05310efff94c1bd19223c7d524e8c59400662be`, block 252544, duration 3000 blocks (endBlock 255544), price 5 tPOT (500000000000000 units), fee 11.557013786556522140 tPOT (11.557014 tPOT).
6. `gate:lock(5)`: tx `0xf84af2e383b8239c350a16bdf074a14925cd954cacd3ca25ec1621a5fcf869db`, block 252552, amount 2 tPOT (2000000000000000 units), minBond 30 tPOT (3000000000000000 units), fee 7.705815450349413530 tPOT (7.705815 tPOT).
7. `claim(3)`: tx `0x9c8ec1c10b2f57ffa90ed22c09db49b019e26b7656825df3bd764bad46505441`, block 258836, claimed 5 tPOT (500000000000000 units), fee 0.015313006591128300 tPOT (0.015313 tPOT).
8. `settle(3)`: tx `0x57d35092a6f16989ae26a59fa35acec60179aac043bbf247f2ecf54c32d8e064`, block 258844, deal 3 settled, fee 0.015311901416981400 tPOT (0.015312 tPOT).
9. `gate:refund(5)`: tx `0x11adf58b7d5071d486e185b4485c380878768ee05c508331cd6a07c7b8347a23`, block 264442, refunded 2 tPOT (2000000000000000 units) to owner, fee 0.015316554794629330 tPOT (0.015317 tPOT).
10. `claim(4)`: tx `0x491fdf174810101c7e96915604d78cc6c0e12bcdb1ef7d810adb264382ca1846`, block 264450, claimed 5 tPOT (500000000000000 units), fee 0.015312840408229480 tPOT (0.015313 tPOT).
11. `claim(5)`: tx `0x0bda52e6038d9955293ffbb2b78935638659696e4e5a1dd905809d6ee2134745`, block 264458, claimed 5 tPOT (500000000000000 units), fee 0.015312840173203620 tPOT (0.015313 tPOT).
12. `settle(4)`: tx `0x5a156d435057ddbeb9de0ca9b4cd48155dbf63391af0fca7cfd76231c4448279`, block 264469, deal 4 settled, fee 0.015311750342159550 tPOT (0.015312 tPOT).
13. `settle(5)`: tx `0x54c71257ed6f82b5ba6cbd0983ea1b99b300fe705c2eed1abecab6bad719fc34`, block 264477, deal 5 settled, fee 0.015311750128917330 tPOT (0.015312 tPOT).

## Refusals Verified (0 Gas / 0 Broadcast)

- `gate lock 3` refused with `Expired` at block 251940 (deal 3 endBlock 250692).
- `gate release 5` refused with `BondTooLow` at block 252560 (provider-1 bond 24 tPOT < minBond 30 tPOT).
- `gate refund 5` refused with `RefundNotAllowed` at block 252564 (still inside term, block 252564 < endBlock 255544).

## Financial Accounting

- Initial Owner Balance: `262.653510196740377575 tPOT` (block 250092)
- Final Owner Balance: `195.509585899517237355 tPOT` (`195.509586 tPOT`) (block 264487)
- Initial Provider-1 Balance: `27.993410962002459140 tPOT` (block 250092)
- Final Provider-1 Balance: `44.932150264353992530 tPOT` (`44.932150 tPOT`) (block 264487)
- Final StorageGate Balance: `0 tPOT` (0 wei)
- Provider-1 Bond: `24 tPOT` (2400000000000000 units)
- Total Transaction Fees: `50.205184994871606830 tPOT` (`50.205185 tPOT`) across 11 transactions against 80 tPOT budget cap.
