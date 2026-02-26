/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/parimutuel_pools.json`.
 */
export type ParimutuelPools = {
  "address": "HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD",
  "metadata": {
    "name": "parimutuelPools",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana parimutuel pool betting program"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Claim payout from resolved pool"
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "pool"
        },
        {
          "name": "userBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "docs": [
        "Deposit USDC to a pool (UP or DOWN side)"
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "userBet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializePool",
      "docs": [
        "Initialize a new pool"
      ],
      "discriminator": [
        95,
        180,
        10,
        172,
        84,
        174,
        232,
        40
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "asset",
          "type": "string"
        },
        {
          "name": "startTime",
          "type": "i64"
        },
        {
          "name": "endTime",
          "type": "i64"
        },
        {
          "name": "lockTime",
          "type": "i64"
        }
      ]
    },
    {
      "name": "resolve",
      "docs": [
        "Resolve pool with final price (authority only)"
      ],
      "discriminator": [
        246,
        150,
        236,
        206,
        108,
        63,
        58,
        10
      ],
      "accounts": [
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "strikePrice",
          "type": "u64"
        },
        {
          "name": "finalPrice",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "userBet",
      "discriminator": [
        180,
        131,
        8,
        241,
        60,
        243,
        46,
        63
      ]
    }
  ],
  "events": [
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "payoutClaimed",
      "discriminator": [
        200,
        39,
        105,
        112,
        116,
        63,
        58,
        149
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    },
    {
      "name": "poolResolved",
      "discriminator": [
        37,
        148,
        82,
        156,
        128,
        131,
        201,
        171
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notJoining",
      "msg": "Pool is not in joining status"
    },
    {
      "code": 6001,
      "name": "depositDeadlinePassed",
      "msg": "Deposit deadline has passed"
    },
    {
      "code": 6002,
      "name": "poolNotEnded",
      "msg": "Pool has not ended yet"
    },
    {
      "code": 6003,
      "name": "notActive",
      "msg": "Pool is not active"
    },
    {
      "code": 6004,
      "name": "notResolved",
      "msg": "Pool is not resolved"
    },
    {
      "code": 6005,
      "name": "zeroDeposit",
      "msg": "Deposit amount must be greater than zero"
    },
    {
      "code": 6006,
      "name": "betAlreadyExists",
      "msg": "User bet already exists"
    },
    {
      "code": 6007,
      "name": "notWinner",
      "msg": "User did not win this pool"
    },
    {
      "code": 6008,
      "name": "alreadyClaimed",
      "msg": "Payout already claimed"
    },
    {
      "code": 6009,
      "name": "invalidPoolStatus",
      "msg": "Invalid pool status for this operation"
    },
    {
      "code": 6010,
      "name": "unauthorized",
      "msg": "Unauthorized: only authority can resolve"
    },
    {
      "code": 6011,
      "name": "invalidTimeConfig",
      "msg": "Invalid time configuration: lock_time must be before start_time, start_time must be before end_time"
    },
    {
      "code": 6012,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6013,
      "name": "noWinningBets",
      "msg": "No bets on winning side"
    }
  ],
  "types": [
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalUp",
            "type": "u64"
          },
          {
            "name": "totalDown",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payoutClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "docs": [
              "Unique pool identifier"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "asset",
            "docs": [
              "Asset symbol (e.g., \"BTC\", \"ETH\")"
            ],
            "type": "string"
          },
          {
            "name": "authority",
            "docs": [
              "Authority that can resolve the pool"
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "USDC mint address"
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Vault PDA for holding USDC"
            ],
            "type": "pubkey"
          },
          {
            "name": "startTime",
            "docs": [
              "Pool start time (when betting locks)"
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Pool end time (when resolution happens)"
            ],
            "type": "i64"
          },
          {
            "name": "lockTime",
            "docs": [
              "Lock time (deadline for deposits)"
            ],
            "type": "i64"
          },
          {
            "name": "strikePrice",
            "docs": [
              "Strike price (captured at start_time)"
            ],
            "type": "u64"
          },
          {
            "name": "finalPrice",
            "docs": [
              "Final price (captured at end_time)"
            ],
            "type": "u64"
          },
          {
            "name": "totalUp",
            "docs": [
              "Total USDC deposited on UP side"
            ],
            "type": "u64"
          },
          {
            "name": "totalDown",
            "docs": [
              "Total USDC deposited on DOWN side"
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Pool status"
            ],
            "type": {
              "defined": {
                "name": "poolStatus"
              }
            }
          },
          {
            "name": "winner",
            "docs": [
              "Winning side (set after resolution)"
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "side"
                }
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "Bump seed for PDA"
            ],
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "docs": [
              "Vault bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "asset",
            "type": "string"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "lockTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "poolResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "strikePrice",
            "type": "u64"
          },
          {
            "name": "finalPrice",
            "type": "u64"
          },
          {
            "name": "winner",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "totalUp",
            "type": "u64"
          },
          {
            "name": "totalDown",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "upcoming"
          },
          {
            "name": "joining"
          },
          {
            "name": "active"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "up"
          },
          {
            "name": "down"
          }
        ]
      }
    },
    {
      "name": "userBet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "docs": [
              "Pool this bet belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "user",
            "docs": [
              "User who placed the bet"
            ],
            "type": "pubkey"
          },
          {
            "name": "side",
            "docs": [
              "Side chosen (UP or DOWN)"
            ],
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "docs": [
              "Amount deposited"
            ],
            "type": "u64"
          },
          {
            "name": "claimed",
            "docs": [
              "Whether payout has been claimed"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "Bump seed for PDA"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
