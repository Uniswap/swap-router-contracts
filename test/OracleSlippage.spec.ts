import { constants, ContractFactory } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { MockObservations, OracleSlippageTest } from '../typechain'
import { FeeAmount } from './shared/constants'
import { expect } from './shared/expect'
import { encodePath } from './shared/path'

const tokens = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
]

describe('OracleSlippage', function () {
  this.timeout(40000)

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  let oracle: OracleSlippageTest
  let mockObservationsFactory: ContractFactory

  const oracleTestFixture = async () => {
    const oracleFactory = await ethers.getContractFactory('OracleSlippageTest')
    const oracle = await oracleFactory.deploy(constants.AddressZero, constants.AddressZero)

    return oracle as OracleSlippageTest
  }

  before('create fixture loader', async () => {
    loadFixture = waffle.createFixtureLoader(await (ethers as any).getSigners())
  })

  beforeEach('deploy fixture', async () => {
    oracle = await loadFixture(oracleTestFixture)
  })

  before('create mockObservationsFactory', async () => {
    mockObservationsFactory = await ethers.getContractFactory('MockObservations')
  })

  async function createMockPool(
    tokenA: string,
    tokenB: string,
    fee: FeeAmount,
    blockTimestamps: number[],
    ticks: number[],
    mockLowObservationCardinality = false
  ): Promise<MockObservations> {
    const mockPool = await mockObservationsFactory.deploy(blockTimestamps, ticks, mockLowObservationCardinality)
    await oracle.registerPool(mockPool.address, tokenA, tokenB, fee)
    await oracle.setTime(blockTimestamps[blockTimestamps.length - 1])
    return mockPool as MockObservations
  }

  describe('#getBlockStartingAndCurrentTick', () => {
    it('fails when observationCardinality == 1', async () => {
      const mockPool = await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 0, 0], true)
      await expect(oracle.testGetBlockStartingAndCurrentTick(mockPool.address)).to.be.revertedWith('NEO')
    })

    it('works when ticks are the same in the same block', async () => {
      const mockPool = await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
      const { blockStartingTick, currentTick } = await oracle.testGetBlockStartingAndCurrentTick(mockPool.address)
      expect(blockStartingTick).to.eq(11)
      expect(currentTick).to.eq(11)
    })

    it('works when ticks are different in the same block', async () => {
      const mockPool = await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
      const { blockStartingTick, currentTick } = await oracle.testGetBlockStartingAndCurrentTick(mockPool.address)
      expect(blockStartingTick).to.eq(11)
      expect(currentTick).to.eq(12)
    })

    it('works when time has passed since the last block', async () => {
      const mockPool = await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
      await oracle.setTime(3)
      const { blockStartingTick, currentTick } = await oracle.testGetBlockStartingAndCurrentTick(mockPool.address)
      expect(blockStartingTick).to.eq(12)
      expect(currentTick).to.eq(12)
    })
  })

  describe('#getSyntheticTicks(bytes,uint32)', () => {
    describe('single pool', () => {
      describe('unchanged ticks; secondsAgo = 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2), [FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(11)
          expect(syntheticCurrentTick).to.eq(11)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2).reverse(), [FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(-11)
          expect(syntheticCurrentTick).to.eq(-11)
        })
      })

      describe('changed ticks; secondsAgo = 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2), [FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(11)
          expect(syntheticCurrentTick).to.eq(12)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2).reverse(), [FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(-11)
          expect(syntheticCurrentTick).to.eq(-12)
        })
      })

      describe('unchanged ticks; secondsAgo != 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2), [FeeAmount.LOW]),
            1
          )
          expect(syntheticAverageTick).to.eq(11)
          expect(syntheticCurrentTick).to.eq(11)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice(0, 2).reverse(), [FeeAmount.LOW]),
            1
          )
          expect(syntheticAverageTick).to.eq(-11)
          expect(syntheticCurrentTick).to.eq(-11)
        })
      })

      describe('changed ticks', () => {
        describe('secondsAgo = 1', () => {
          beforeEach(async () => {
            await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
          })

          it('normal order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice(0, 2), [FeeAmount.LOW]),
              1
            )
            expect(syntheticAverageTick).to.eq(11)
            expect(syntheticCurrentTick).to.eq(12)
          })

          it('reverse order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice(0, 2).reverse(), [FeeAmount.LOW]),
              1
            )
            expect(syntheticAverageTick).to.eq(-11)
            expect(syntheticCurrentTick).to.eq(-12)
          })
        })

        describe('secondsAgo = 2', () => {
          beforeEach(async () => {
            await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [10, 12, 13])
          })

          it('normal order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice(0, 2), [FeeAmount.LOW]),
              2
            )
            expect(syntheticAverageTick).to.eq(11)
            expect(syntheticCurrentTick).to.eq(13)
          })

          it('reverse order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice(0, 2).reverse(), [FeeAmount.LOW]),
              2
            )
            expect(syntheticAverageTick).to.eq(-11)
            expect(syntheticCurrentTick).to.eq(-13)
          })
        })
      })
    })

    describe('two pools', () => {
      describe('unchanged ticks; secondsAgo = 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
          await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(22)
          expect(syntheticCurrentTick).to.eq(22)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(-22)
          expect(syntheticCurrentTick).to.eq(-22)
        })
      })

      describe('changed ticks; secondsAgo = 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
          await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(22)
          expect(syntheticCurrentTick).to.eq(24)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
            0
          )
          expect(syntheticAverageTick).to.eq(-22)
          expect(syntheticCurrentTick).to.eq(-24)
        })
      })

      describe('unchanged ticks; secondsAgo != 0', () => {
        beforeEach(async () => {
          await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
          await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 11])
        })

        it('normal order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]),
            1
          )
          expect(syntheticAverageTick).to.eq(22)
          expect(syntheticCurrentTick).to.eq(22)
        })

        it('reverse order', async () => {
          const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
            encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
            1
          )
          expect(syntheticAverageTick).to.eq(-22)
          expect(syntheticCurrentTick).to.eq(-22)
        })
      })

      describe('changed ticks', () => {
        describe('secondsAgo = 1', () => {
          beforeEach(async () => {
            await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
            await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
          })

          it('normal order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]),
              1
            )
            expect(syntheticAverageTick).to.eq(22)
            expect(syntheticCurrentTick).to.eq(24)
          })

          it('reverse order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
              1
            )
            expect(syntheticAverageTick).to.eq(-22)
            expect(syntheticCurrentTick).to.eq(-24)
          })
        })

        describe('secondsAgo = 2', () => {
          beforeEach(async () => {
            await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [10, 12, 13])
            await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [10, 12, 13])
          })

          it('normal order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]),
              2
            )
            expect(syntheticAverageTick).to.eq(22)
            expect(syntheticCurrentTick).to.eq(26)
          })

          it('reverse order', async () => {
            const { syntheticAverageTick, syntheticCurrentTick } = await oracle['testGetSyntheticTicks(bytes,uint32)'](
              encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
              2
            )
            expect(syntheticAverageTick).to.eq(-22)
            expect(syntheticCurrentTick).to.eq(-26)
          })
        })
      })
    })
  })

  describe('#getSyntheticTicks(bytes[],uint128[],uint32)', () => {
    describe('same price', () => {
      beforeEach(async () => {
        await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        await createMockPool(tokens[0], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 22, 24])
      })

      it('normal order', async () => {
        const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
          'testGetSyntheticTicks(bytes[],uint128[],uint32)'
        ](
          [encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]), encodePath([tokens[0], tokens[2]], [FeeAmount.LOW])],
          [1, 1],
          0
        )

        expect(averageSyntheticAverageTick).to.eq(22)
        expect(averageSyntheticCurrentTick).to.eq(24)
      })

      it('reverse order', async () => {
        const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
          'testGetSyntheticTicks(bytes[],uint128[],uint32)'
        ](
          [
            encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
            encodePath([tokens[2], tokens[0]], [FeeAmount.LOW]),
          ],
          [1, 1],
          0
        )

        expect(averageSyntheticAverageTick).to.eq(-22)
        expect(averageSyntheticCurrentTick).to.eq(-24)
      })
    })

    describe('difference price', () => {
      beforeEach(async () => {
        await createMockPool(tokens[0], tokens[1], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        await createMockPool(tokens[1], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 11, 12])
        await createMockPool(tokens[0], tokens[2], FeeAmount.LOW, [0, 1, 2], [0, 44, 48])
      })

      describe('same weight', () => {
        it('normal order', async () => {
          const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
            'testGetSyntheticTicks(bytes[],uint128[],uint32)'
          ](
            [encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]), encodePath([tokens[0], tokens[2]], [FeeAmount.LOW])],
            [1, 1],
            0
          )

          expect(averageSyntheticAverageTick).to.eq(33)
          expect(averageSyntheticCurrentTick).to.eq(36)
        })

        it('reverse order', async () => {
          const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
            'testGetSyntheticTicks(bytes[],uint128[],uint32)'
          ](
            [
              encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
              encodePath([tokens[2], tokens[0]], [FeeAmount.LOW]),
            ],
            [1, 1],
            0
          )

          expect(averageSyntheticAverageTick).to.eq(-33)
          expect(averageSyntheticCurrentTick).to.eq(-36)
        })
      })

      describe('different weights', () => {
        it('normal order', async () => {
          const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
            'testGetSyntheticTicks(bytes[],uint128[],uint32)'
          ](
            [encodePath(tokens, [FeeAmount.LOW, FeeAmount.LOW]), encodePath([tokens[0], tokens[2]], [FeeAmount.LOW])],
            [1, 2],
            0
          )

          expect(averageSyntheticAverageTick).to.eq(36)
          expect(averageSyntheticCurrentTick).to.eq(40)
        })

        it('reverse order', async () => {
          const { averageSyntheticAverageTick, averageSyntheticCurrentTick } = await oracle[
            'testGetSyntheticTicks(bytes[],uint128[],uint32)'
          ](
            [
              encodePath(tokens.slice().reverse(), [FeeAmount.LOW, FeeAmount.LOW]),
              encodePath([tokens[2], tokens[0]], [FeeAmount.LOW]),
            ],
            [1, 2],
            0
          )

          expect(averageSyntheticAverageTick).to.eq(-37)
          expect(averageSyntheticCurrentTick).to.eq(-40)
        })
      })
    })
  })
})
