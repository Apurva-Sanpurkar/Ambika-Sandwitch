export const calculateWaitTime = (totalSandwichesInQueue) => {
    const GRILLER_CAPACITY = 12; // 3 grillers * 4 slots
    const PREP_TIME_PER_BATCH = 5; // average minutes per batch
    
    // Calculate how many full batches are ahead
    const batchesAhead = Math.ceil((totalSandwichesInQueue + 1) / GRILLER_CAPACITY);
    
    return {
      minutes: batchesAhead * PREP_TIME_PER_BATCH,
      batches: batchesAhead
    };
  };