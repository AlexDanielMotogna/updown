/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/parimutuel_pools.json`.
 */
export type ParimutuelPools = {
    "address": "HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD";
    "metadata": {
        "name": "parimutuelPools";
        "version": "0.1.0";
        "spec": "0.1.0";
        "description": "Solana parimutuel pool betting program";
    };
    "instructions": [
        {
            "name": "cancelTournament";
            "docs": [
                "Cancel tournament (authority only, enables refunds)"
            ];
            "discriminator": [
                249,
                227,
                133,
                5,
                9,
                142,
                29,
                122
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                    "relations": [
                        "tournament"
                    ];
                }
            ];
            "args": [];
        },
        {
            "name": "claim";
            "docs": [
                "Claim payout from resolved pool (user + authority co-sign, with fee).",
                "`side` selects which per-side UserBet account to claim (the winning side)."
            ];
            "discriminator": [
                62,
                198,
                214,
                193,
                213,
                159,
                108,
                210
            ];
            "accounts": [
                {
                    "name": "pool";
                },
                {
                    "name": "userBet";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "authority";
                    "docs": [
                        "Authority co-signs to enforce fee_bps — prevents users from passing fee_bps=0"
                    ];
                    "signer": true;
                },
                {
                    "name": "feeWallet";
                    "docs": [
                        "Fee wallet receives platform fees"
                    ];
                    "writable": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [
                {
                    "name": "feeBps";
                    "type": "u16";
                },
                {
                    "name": "side";
                    "type": {
                        "defined": {
                            "name": "side";
                        };
                    };
                }
            ];
        },
        {
            "name": "claimTournamentPrize";
            "docs": [
                "Winner claims prize from tournament vault (5% fee on-chain)"
            ];
            "discriminator": [
                219,
                207,
                183,
                94,
                201,
                32,
                78,
                193
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                },
                {
                    "name": "participant";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    97,
                                    114,
                                    116,
                                    105,
                                    99,
                                    105,
                                    112,
                                    97,
                                    110,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "tournament";
                            },
                            {
                                "kind": "account";
                                "path": "user";
                            }
                        ];
                    };
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "authority";
                    "docs": [
                        "Authority co-signs (prevents fee manipulation)"
                    ];
                    "signer": true;
                },
                {
                    "name": "feeWallet";
                    "docs": [
                        "Fee wallet receives platform fee"
                    ];
                    "writable": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [];
        },
        {
            "name": "closePool";
            "docs": [
                "Close a resolved pool and reclaim rent (authority only)"
            ];
            "discriminator": [
                140,
                189,
                209,
                23,
                239,
                62,
                239,
                11
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    118,
                                    97,
                                    117,
                                    108,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "pool.pool_id";
                                "account": "pool";
                            }
                        ];
                    };
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                    "relations": [
                        "pool"
                    ];
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [];
        },
        {
            "name": "closeTournament";
            "docs": [
                "Close tournament + vault, reclaim rent"
            ];
            "discriminator": [
                14,
                80,
                54,
                9,
                221,
                239,
                201,
                35
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    116,
                                    111,
                                    117,
                                    114,
                                    110,
                                    97,
                                    109,
                                    101,
                                    110,
                                    116,
                                    95,
                                    118,
                                    97,
                                    117,
                                    108,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "tournament.tournament_id";
                                "account": "tournament";
                            }
                        ];
                    };
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                    "relations": [
                        "tournament"
                    ];
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [];
        },
        {
            "name": "deposit";
            "docs": [
                "Deposit USDC to a pool (side 0=UP/HOME, 1=DOWN/AWAY, 2=DRAW)"
            ];
            "discriminator": [
                242,
                35,
                198,
                137,
                82,
                225,
                242,
                182
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                },
                {
                    "name": "userBet";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "side";
                    "type": {
                        "defined": {
                            "name": "side";
                        };
                    };
                },
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
        },
        {
            "name": "forceClosePool";
            "docs": [
                "Force-close a resolved pool bypassing vault seeds check (orphan recovery)"
            ];
            "discriminator": [
                113,
                203,
                148,
                102,
                142,
                248,
                118,
                240
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                    "relations": [
                        "pool"
                    ];
                }
            ];
            "args": [];
        },
        {
            "name": "initializePool";
            "docs": [
                "Initialize a new pool (2-way for crypto, 3-way for sports)"
            ];
            "discriminator": [
                95,
                180,
                10,
                172,
                84,
                174,
                232,
                40
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    111,
                                    108
                                ];
                            },
                            {
                                "kind": "arg";
                                "path": "poolId";
                            }
                        ];
                    };
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    118,
                                    97,
                                    117,
                                    108,
                                    116
                                ];
                            },
                            {
                                "kind": "arg";
                                "path": "poolId";
                            }
                        ];
                    };
                },
                {
                    "name": "usdcMint";
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                },
                {
                    "name": "rent";
                    "address": "SysvarRent111111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "poolId";
                    "type": {
                        "array": [
                            "u8",
                            32
                        ];
                    };
                },
                {
                    "name": "asset";
                    "type": "string";
                },
                {
                    "name": "startTime";
                    "type": "i64";
                },
                {
                    "name": "endTime";
                    "type": "i64";
                },
                {
                    "name": "lockTime";
                    "type": "i64";
                },
                {
                    "name": "strikePrice";
                    "type": "u64";
                },
                {
                    "name": "numSides";
                    "type": "u8";
                }
            ];
        },
        {
            "name": "initializeTournament";
            "docs": [
                "Initialize a tournament with vault for entry fees"
            ];
            "discriminator": [
                75,
                218,
                86,
                80,
                49,
                127,
                155,
                186
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    116,
                                    111,
                                    117,
                                    114,
                                    110,
                                    97,
                                    109,
                                    101,
                                    110,
                                    116
                                ];
                            },
                            {
                                "kind": "arg";
                                "path": "tournamentId";
                            }
                        ];
                    };
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    116,
                                    111,
                                    117,
                                    114,
                                    110,
                                    97,
                                    109,
                                    101,
                                    110,
                                    116,
                                    95,
                                    118,
                                    97,
                                    117,
                                    108,
                                    116
                                ];
                            },
                            {
                                "kind": "arg";
                                "path": "tournamentId";
                            }
                        ];
                    };
                },
                {
                    "name": "usdcMint";
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                },
                {
                    "name": "rent";
                    "address": "SysvarRent111111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "tournamentId";
                    "type": {
                        "array": [
                            "u8",
                            32
                        ];
                    };
                },
                {
                    "name": "entryFee";
                    "type": "u64";
                },
                {
                    "name": "maxParticipants";
                    "type": "u16";
                }
            ];
        },
        {
            "name": "refund";
            "docs": [
                "Refund a user's bet on a given `side` (authority-only, no user signature needed)"
            ];
            "discriminator": [
                2,
                96,
                183,
                251,
                63,
                208,
                46,
                46
            ];
            "accounts": [
                {
                    "name": "pool";
                },
                {
                    "name": "userBet";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                },
                {
                    "name": "authority";
                    "signer": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [
                {
                    "name": "side";
                    "type": {
                        "defined": {
                            "name": "side";
                        };
                    };
                }
            ];
        },
        {
            "name": "refundParticipant";
            "docs": [
                "Refund participant entry fee (cancelled tournaments, authority-signed)"
            ];
            "discriminator": [
                149,
                166,
                93,
                207,
                122,
                167,
                154,
                218
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                },
                {
                    "name": "participant";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    97,
                                    114,
                                    116,
                                    105,
                                    99,
                                    105,
                                    112,
                                    97,
                                    110,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "tournament";
                            },
                            {
                                "kind": "account";
                                "path": "user";
                            }
                        ];
                    };
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                },
                {
                    "name": "authority";
                    "signer": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [];
        },
        {
            "name": "registerParticipant";
            "docs": [
                "Register as tournament participant (deposits entry fee to vault)"
            ];
            "discriminator": [
                248,
                112,
                38,
                215,
                226,
                230,
                249,
                40
            ];
            "accounts": [
                {
                    "name": "tournament";
                    "writable": true;
                },
                {
                    "name": "participant";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    97,
                                    114,
                                    116,
                                    105,
                                    99,
                                    105,
                                    112,
                                    97,
                                    110,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "tournament";
                            },
                            {
                                "kind": "account";
                                "path": "user";
                            }
                        ];
                    };
                },
                {
                    "name": "vault";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "user";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [];
        },
        {
            "name": "resolve";
            "docs": [
                "Resolve pool — for crypto: by price, for sports: by winner index"
            ];
            "discriminator": [
                246,
                150,
                236,
                206,
                108,
                63,
                58,
                10
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [
                {
                    "name": "strikePrice";
                    "type": "u64";
                },
                {
                    "name": "finalPrice";
                    "type": "u64";
                }
            ];
        },
        {
            "name": "resolveWithWinner";
            "docs": [
                "Resolve pool with explicit winner (for sports pools)"
            ];
            "discriminator": [
                200,
                87,
                85,
                170,
                63,
                238,
                116,
                50
            ];
            "accounts": [
                {
                    "name": "pool";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [
                {
                    "name": "winner";
                    "type": {
                        "defined": {
                            "name": "side";
                        };
                    };
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "pool";
            "discriminator": [
                241,
                154,
                109,
                4,
                17,
                177,
                109,
                188
            ];
        },
        {
            "name": "tournament";
            "discriminator": [
                175,
                139,
                119,
                242,
                115,
                194,
                57,
                92
            ];
        },
        {
            "name": "tournamentParticipant";
            "discriminator": [
                194,
                32,
                143,
                13,
                32,
                219,
                217,
                125
            ];
        },
        {
            "name": "userBet";
            "discriminator": [
                180,
                131,
                8,
                241,
                60,
                243,
                46,
                63
            ];
        }
    ];
    "events": [
        {
            "name": "deposited";
            "discriminator": [
                111,
                141,
                26,
                45,
                161,
                35,
                100,
                57
            ];
        },
        {
            "name": "participantRefunded";
            "discriminator": [
                213,
                189,
                210,
                180,
                238,
                68,
                116,
                32
            ];
        },
        {
            "name": "participantRegistered";
            "discriminator": [
                47,
                115,
                159,
                109,
                135,
                121,
                70,
                193
            ];
        },
        {
            "name": "payoutClaimed";
            "discriminator": [
                200,
                39,
                105,
                112,
                116,
                63,
                58,
                149
            ];
        },
        {
            "name": "poolClosed";
            "discriminator": [
                106,
                46,
                29,
                231,
                42,
                44,
                73,
                119
            ];
        },
        {
            "name": "poolCreated";
            "discriminator": [
                202,
                44,
                41,
                88,
                104,
                220,
                157,
                82
            ];
        },
        {
            "name": "poolResolved";
            "discriminator": [
                37,
                148,
                82,
                156,
                128,
                131,
                201,
                171
            ];
        },
        {
            "name": "refunded";
            "discriminator": [
                35,
                103,
                149,
                246,
                196,
                123,
                221,
                99
            ];
        },
        {
            "name": "tournamentCancelled";
            "discriminator": [
                118,
                92,
                146,
                131,
                165,
                72,
                81,
                120
            ];
        },
        {
            "name": "tournamentClosed";
            "discriminator": [
                246,
                137,
                155,
                89,
                226,
                38,
                87,
                8
            ];
        },
        {
            "name": "tournamentCreated";
            "discriminator": [
                102,
                32,
                240,
                45,
                52,
                64,
                97,
                0
            ];
        },
        {
            "name": "tournamentPrizeClaimed";
            "discriminator": [
                154,
                237,
                249,
                4,
                72,
                239,
                196,
                101
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "notJoining";
            "msg": "Pool is not in joining status";
        },
        {
            "code": 6001;
            "name": "depositDeadlinePassed";
            "msg": "Deposit deadline has passed";
        },
        {
            "code": 6002;
            "name": "poolNotEnded";
            "msg": "Pool has not ended yet";
        },
        {
            "code": 6003;
            "name": "notActive";
            "msg": "Pool is not active";
        },
        {
            "code": 6004;
            "name": "notResolved";
            "msg": "Pool is not resolved";
        },
        {
            "code": 6005;
            "name": "zeroDeposit";
            "msg": "Deposit amount must be greater than zero";
        },
        {
            "code": 6006;
            "name": "betAlreadyExists";
            "msg": "User bet already exists";
        },
        {
            "code": 6007;
            "name": "sideMismatch";
            "msg": "Cannot change sides: deposits must be on the same side as your first bet";
        },
        {
            "code": 6008;
            "name": "notWinner";
            "msg": "User did not win this pool";
        },
        {
            "code": 6009;
            "name": "alreadyClaimed";
            "msg": "Payout already claimed";
        },
        {
            "code": 6010;
            "name": "invalidPoolStatus";
            "msg": "Invalid pool status for this operation";
        },
        {
            "code": 6011;
            "name": "unauthorized";
            "msg": "Unauthorized: only authority can resolve";
        },
        {
            "code": 6012;
            "name": "invalidTimeConfig";
            "msg": "Invalid time configuration: lock_time must be before end_time";
        },
        {
            "code": 6013;
            "name": "overflow";
            "msg": "Arithmetic overflow";
        },
        {
            "code": 6014;
            "name": "noWinningBets";
            "msg": "No bets on winning side";
        },
        {
            "code": 6015;
            "name": "invalidFeeBps";
            "msg": "Fee basis points must be <= 10000";
        },
        {
            "code": 6016;
            "name": "vaultNotEmpty";
            "msg": "Vault still has tokens — all claims/refunds must be processed first";
        },
        {
            "code": 6017;
            "name": "invalidSide";
            "msg": "Invalid side for this pool (e.g., Draw on a 2-side pool)";
        },
        {
            "code": 6018;
            "name": "invalidNumSides";
            "msg": "Invalid number of sides: must be 2 or 3";
        },
        {
            "code": 6019;
            "name": "tournamentNotRegistering";
            "msg": "Tournament is not in registering status";
        },
        {
            "code": 6020;
            "name": "tournamentFull";
            "msg": "Tournament is full";
        },
        {
            "code": 6021;
            "name": "tournamentNotCompleted";
            "msg": "Tournament is not completed";
        },
        {
            "code": 6022;
            "name": "tournamentNotWinner";
            "msg": "User is not the tournament winner";
        },
        {
            "code": 6023;
            "name": "tournamentAlreadyClaimed";
            "msg": "Tournament prize already claimed";
        },
        {
            "code": 6024;
            "name": "tournamentNotCancelled";
            "msg": "Tournament is not cancelled";
        },
        {
            "code": 6025;
            "name": "tournamentAlreadyRefunded";
            "msg": "Tournament participant already refunded";
        },
        {
            "code": 6026;
            "name": "tournamentVaultNotEmpty";
            "msg": "Tournament vault still has tokens";
        }
    ];
    "types": [
        {
            "name": "deposited";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "user";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "totalUp";
                        "type": "u64";
                    },
                    {
                        "name": "totalDown";
                        "type": "u64";
                    },
                    {
                        "name": "totalDraw";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "participantRefunded";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "user";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "participantRegistered";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "user";
                        "type": "pubkey";
                    },
                    {
                        "name": "entryFee";
                        "type": "u64";
                    },
                    {
                        "name": "prizePool";
                        "type": "u64";
                    },
                    {
                        "name": "participantCount";
                        "type": "u16";
                    }
                ];
            };
        },
        {
            "name": "payoutClaimed";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "user";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "fee";
                        "type": "u64";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    }
                ];
            };
        },
        {
            "name": "pool";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "docs": [
                            "Unique pool identifier"
                        ];
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "asset";
                        "docs": [
                            "Asset symbol (e.g., \"BTC\", \"ETH\") or match ID (e.g., \"UCL:RMA-BAR\")"
                        ];
                        "type": "string";
                    },
                    {
                        "name": "authority";
                        "docs": [
                            "Authority that can resolve the pool"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "usdcMint";
                        "docs": [
                            "USDC mint address"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "vault";
                        "docs": [
                            "Vault PDA for holding USDC"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "startTime";
                        "docs": [
                            "Pool start time (when betting locks)"
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "endTime";
                        "docs": [
                            "Pool end time (when resolution happens)"
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "lockTime";
                        "docs": [
                            "Lock time (deadline for deposits)"
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "strikePrice";
                        "docs": [
                            "Strike price (crypto pools only, 0 for sports)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "finalPrice";
                        "docs": [
                            "Final price (crypto pools only, 0 for sports)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "totalUp";
                        "docs": [
                            "Total USDC deposited on side 0 (UP / HOME)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "totalDown";
                        "docs": [
                            "Total USDC deposited on side 1 (DOWN / AWAY)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "totalDraw";
                        "docs": [
                            "Total USDC deposited on side 2 (DRAW — sports only, always 0 for crypto)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "numSides";
                        "docs": [
                            "Number of sides: 2 for crypto, 3 for sports"
                        ];
                        "type": "u8";
                    },
                    {
                        "name": "status";
                        "docs": [
                            "Pool status"
                        ];
                        "type": {
                            "defined": {
                                "name": "poolStatus";
                            };
                        };
                    },
                    {
                        "name": "winner";
                        "docs": [
                            "Winning side (set after resolution)"
                        ];
                        "type": {
                            "option": {
                                "defined": {
                                    "name": "side";
                                };
                            };
                        };
                    },
                    {
                        "name": "bump";
                        "docs": [
                            "Bump seed for PDA"
                        ];
                        "type": "u8";
                    },
                    {
                        "name": "vaultBump";
                        "docs": [
                            "Vault bump seed"
                        ];
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "poolClosed";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "rentReclaimed";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "poolCreated";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "asset";
                        "type": "string";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "startTime";
                        "type": "i64";
                    },
                    {
                        "name": "endTime";
                        "type": "i64";
                    },
                    {
                        "name": "lockTime";
                        "type": "i64";
                    },
                    {
                        "name": "strikePrice";
                        "type": "u64";
                    },
                    {
                        "name": "numSides";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "poolResolved";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "strikePrice";
                        "type": "u64";
                    },
                    {
                        "name": "finalPrice";
                        "type": "u64";
                    },
                    {
                        "name": "winner";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "totalUp";
                        "type": "u64";
                    },
                    {
                        "name": "totalDown";
                        "type": "u64";
                    },
                    {
                        "name": "totalDraw";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "poolStatus";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "upcoming";
                    },
                    {
                        "name": "joining";
                    },
                    {
                        "name": "active";
                    },
                    {
                        "name": "resolved";
                    }
                ];
            };
        },
        {
            "name": "refunded";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "poolId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "user";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    }
                ];
            };
        },
        {
            "name": "side";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "up";
                    },
                    {
                        "name": "down";
                    },
                    {
                        "name": "draw";
                    }
                ];
            };
        },
        {
            "name": "tournament";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "docs": [
                            "32-byte ID (SHA-256 of DB UUID)"
                        ];
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "authority";
                        "docs": [
                            "Authority that can resolve/cancel"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "usdcMint";
                        "docs": [
                            "USDC mint address"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "vault";
                        "docs": [
                            "Vault PDA for holding USDC entry fees"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "entryFee";
                        "docs": [
                            "Entry fee per participant (USDC lamports)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "maxParticipants";
                        "docs": [
                            "Maximum number of participants"
                        ];
                        "type": "u16";
                    },
                    {
                        "name": "participantCount";
                        "docs": [
                            "Current number of registered participants"
                        ];
                        "type": "u16";
                    },
                    {
                        "name": "prizePool";
                        "docs": [
                            "Accumulated prize pool (should match vault balance)"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "status";
                        "docs": [
                            "Tournament status"
                        ];
                        "type": {
                            "defined": {
                                "name": "tournamentStatus";
                            };
                        };
                    },
                    {
                        "name": "winner";
                        "docs": [
                            "Winner pubkey (set when status = Completed)"
                        ];
                        "type": {
                            "option": "pubkey";
                        };
                    },
                    {
                        "name": "bump";
                        "docs": [
                            "Bump for Tournament PDA"
                        ];
                        "type": "u8";
                    },
                    {
                        "name": "vaultBump";
                        "docs": [
                            "Bump for Vault PDA"
                        ];
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "tournamentCancelled";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "tournamentClosed";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "rentReclaimed";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "tournamentCreated";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "entryFee";
                        "type": "u64";
                    },
                    {
                        "name": "maxParticipants";
                        "type": "u16";
                    }
                ];
            };
        },
        {
            "name": "tournamentParticipant";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournament";
                        "docs": [
                            "Tournament this participant belongs to"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "user";
                        "docs": [
                            "User's wallet pubkey"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "refunded";
                        "docs": [
                            "Whether entry fee has been refunded"
                        ];
                        "type": "bool";
                    },
                    {
                        "name": "claimed";
                        "docs": [
                            "Whether prize has been claimed"
                        ];
                        "type": "bool";
                    },
                    {
                        "name": "bump";
                        "docs": [
                            "Bump seed"
                        ];
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "tournamentPrizeClaimed";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "tournamentId";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "winner";
                        "type": "pubkey";
                    },
                    {
                        "name": "prizeAmount";
                        "type": "u64";
                    },
                    {
                        "name": "fee";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "tournamentStatus";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "registering";
                    },
                    {
                        "name": "active";
                    },
                    {
                        "name": "completed";
                    },
                    {
                        "name": "cancelled";
                    }
                ];
            };
        },
        {
            "name": "userBet";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "pool";
                        "docs": [
                            "Pool this bet belongs to"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "user";
                        "docs": [
                            "User who placed the bet"
                        ];
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "docs": [
                            "Side chosen (Up=0, Down=1, Draw=2)"
                        ];
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "amount";
                        "docs": [
                            "Amount deposited"
                        ];
                        "type": "u64";
                    },
                    {
                        "name": "claimed";
                        "docs": [
                            "Whether payout has been claimed"
                        ];
                        "type": "bool";
                    },
                    {
                        "name": "bump";
                        "docs": [
                            "Bump seed for PDA"
                        ];
                        "type": "u8";
                    }
                ];
            };
        }
    ];
};
//# sourceMappingURL=parimutuel_pools.d.ts.map