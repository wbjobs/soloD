/*-------------------------------------------------------------------------
 *
 * hnsw_build.c
 *	  Build operations for HNSW index - with batch support and memory management
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"
#include "utils/rel.h"
#include "utils/tuplesort.h"
#include "miscadmin.h"

/*
 * Initialize batch build state
 */
void
hnsw_build_batch_init(HnswBuildState *state, HnswIndex *index, size_t work_mem_bytes)
{
	size_t node_size;
	size_t vector_size;

	MemSet(state, 0, sizeof(HnswBuildState));
	state->index = index;
	state->work_mem_limit = work_mem_bytes;
	state->batch_count = 0;
	state->total_count = 0;
	state->batch_fill = 0;

	/* Calculate object sizes */
	node_size = sizeof(HnswNode) +
		index->dimensions * sizeof(HnswVector) +
		index->m * 2 * sizeof(HnswNeighbor);
	vector_size = index->dimensions * sizeof(HnswVector);

	/* Create slab allocators */
	state->node_slab = hnsw_slab_create(CurrentMemoryContext,
										 node_size,
										 work_mem_bytes / 2);
	state->vector_slab = hnsw_slab_create(CurrentMemoryContext,
										   vector_size,
										   work_mem_bytes / 2);

	/* Allocate batch buffer */
	state->batch_vectors = (HnswVector **)
		MemoryContextAlloc(CurrentMemoryContext,
						   HNSW_BATCH_SIZE * sizeof(HnswVector *));
	state->batch_tids = (ItemPointer)
		MemoryContextAlloc(CurrentMemoryContext,
						   HNSW_BATCH_SIZE * sizeof(ItemPointerData));

	hnsw_log_memory_usage("batch_init", state);
}

/*
 * Add a vector to the current batch
 * Returns true if batch needs to be flushed
 */
bool
hnsw_build_batch_add(HnswBuildState *state, HnswVector *vector, ItemPointer tid)
{
	bool need_flush = false;

	/* Copy vector to slab allocator */
	HnswVector *vec_copy = (HnswVector *) hnsw_slab_alloc(state->vector_slab);
	memcpy(vec_copy, vector, state->index->dimensions * sizeof(HnswVector));

	state->batch_vectors[state->batch_fill] = vec_copy;
	if (tid)
		state->batch_tids[state->batch_fill] = *tid;
	state->batch_fill++;
	state->total_count++;

	/* Check if we need to flush (batch size or memory limit) */
	if (state->batch_fill >= HNSW_BATCH_SIZE)
		need_flush = true;
	else if (state->total_count % HNSW_MEMORY_CHECK_INTERVAL == 0)
	{
		if (hnsw_slab_near_limit(state->node_slab) ||
			hnsw_slab_near_limit(state->vector_slab))
		{
			ereport(DEBUG1,
					(errmsg("[HNSW] Memory limit approaching, triggering flush")));
			need_flush = true;
		}
	}

	return need_flush;
}

/*
 * Trigger temporary merge operation to free memory
 */
void
hnsw_trigger_temp_merge(HnswIndex *index)
{
	/* 
	 * In a real implementation, this would:
	 * 1. Write current in-memory graph to temporary storage
	 * 2. Compact neighbor lists
	 * 3. Free up memory for continued building
	 * 4. Continue building from the compacted state
	 *
	 * For this implementation, we'll log and continue
	 */
	ereport(DEBUG1,
			(errmsg("[HNSW] Temporary merge triggered to reduce memory usage")));

	/* Reset deleted nodes to free some space */
	if (index->deleted_nodes)
	{
		HASH_SEQ_STATUS status;
		HnswNodeID *node_id;

		hash_seq_init(&status, index->deleted_nodes);
		while ((node_id = (HnswNodeID *) hash_seq_search(&status)) != NULL)
		{
			hash_search(index->deleted_nodes, node_id, HASH_REMOVE, NULL);
		}
	}
}

/*
 * Flush current batch - insert all vectors into HNSW
 */
void
hnsw_build_batch_flush(HnswBuildState *state)
{
	int i;

	if (state->batch_fill == 0)
		return;

	hnsw_log_memory_usage("before_batch_start", state);

	ereport(DEBUG1,
			(errmsg("[HNSW] Flushing batch %d: %d vectors to insert",
					state->batch_count, state->batch_fill)));

	/* Insert all vectors in batch */
	for (i = 0; i < state->batch_fill; i++)
	{
		hnsw_insert_node(state->index,
						  state->batch_vectors[i],
						  &state->batch_tids[i]);
	}

	state->batch_count++;
	state->batch_fill = 0;

	/* Check memory and trigger temp merge if needed */
	if (hnsw_slab_near_limit(state->node_slab) ||
		hnsw_slab_near_limit(state->vector_slab))
	{
		hnsw_trigger_temp_merge(state->index);
	}

	hnsw_log_memory_usage("after_batch_flush", state);
}

/*
 * Finish batch build and clean up
 */
void
hnsw_build_batch_finish(HnswBuildState *state)
{
	/* Flush any remaining vectors */
	hnsw_build_batch_flush(state);

	ereport(LOG,
			(errmsg("[HNSW] Index build complete: %d vectors in %d batches",
					state->total_count, state->batch_count)));

	hnsw_log_memory_usage("build_complete", state);

	/* Clean up batch buffer */
	if (state->batch_vectors)
		pfree(state->batch_vectors);
	if (state->batch_tids)
		pfree(state->batch_tids);

	/* Don't destroy slabs yet - index still needs them!
	 * Slabs will be destroyed when index is freed */
}

/*
 * Build HNSW index from scratch - with batch mode
 */
IndexBuildResult *
hnsw_build(Relation heap, Relation index, IndexInfo *indexInfo)
{
	IndexBuildResult *result;
	HnswIndex	hnsw_index;
	HnswBuildState build_state;
	double		indtuples = 0;
	HeapScanDesc scan;
	HeapTuple	tuple;
	Tuplesortstate *tuplesort;
	TupleDesc	tupDesc;
	int			work_mem_bytes = maintenance_work_mem * 1024L;
	int			count = 0;

	result = (IndexBuildResult *) palloc(sizeof(IndexBuildResult));
	result->heap_tuples = 0;
	result->index_tuples = 0;

	/* Initialize HNSW index structure */
	hnsw_init_index(&hnsw_index, index);

	/* Initialize batch build state */
	hnsw_build_batch_init(&build_state, &hnsw_index, work_mem_bytes);

	/* Scan the heap to collect all vectors */
	scan = heap_beginscan(heap, SnapshotAny, 0, NULL);

	/* Create tuplesort for sorting */
	tupDesc = RelationGetDescr(heap);
	tuplesort = tuplesort_begin_heap(tupDesc,
									 indexInfo->ii_NumIndexAttrs,
									 indexInfo->ii_IndexAttrNumbers,
									 maintenance_work_mem,
									 false);

	ereport(LOG,
			(errmsg("[HNSW] Starting index build with work_mem = %d KB",
					maintenance_work_mem)));

	while ((tuple = heap_getnext(scan, ForwardScanDirection)) != NULL)
	{
		Datum		values[INDEX_MAX_KEYS];
		bool		isnull[INDEX_MAX_KEYS];

		CHECK_FOR_INTERRUPTS();

		IndexDatumBuildCallback(tuple, heap, indexInfo, values, isnull);

		if (!isnull[0])
			tuplesort_putdatum(tuplesort, values[0], isnull[0]);

		result->heap_tuples++;
	}

	tuplesort_performsort(tuplesort);

	ereport(LOG,
			(errmsg("[HNSW] Sort complete, starting insertion: %.0f tuples",
					result->heap_tuples)));

	/* Insert sorted vectors into HNSW index using batch mode */
	for (;;)
	{
		Datum		value;
		bool		isnull;
		ArrayType  *array;
		HnswVector *vector;
		int			dimensions;

		CHECK_FOR_INTERRUPTS();

		if (!tuplesort_getdatum(tuplesort, true, &value, &isnull, NULL))
			break;

		if (isnull)
			continue;

		array = DatumGetArrayTypeP(value);
		vector = array_to_hnsw_vector(array, &dimensions);

		/* Add to batch and flush if needed */
		if (hnsw_build_batch_add(&build_state, vector, NULL))
			hnsw_build_batch_flush(&build_state);

		pfree(vector);
		indtuples++;
		count++;

		/* Progress report every 100k vectors */
		if (count % 100000 == 0)
		{
			ereport(LOG,
					(errmsg("[HNSW] Index build progress: %d vectors inserted",
							count)));
		}
	}

	/* Final flush */
	hnsw_build_batch_finish(&build_state);

	tuplesort_end(tuplesort);
	heap_endscan(scan);

	result->index_tuples = indtuples;

	/* Clean up build state slabs */
	if (build_state.node_slab)
		hnsw_slab_destroy(build_state.node_slab);
	if (build_state.vector_slab)
		hnsw_slab_destroy(build_state.vector_slab);

	/* Don't free index here - caller will do that */

	return result;
}

/*
 * Worker thread function for parallel build
 */
static void *
hnsw_build_worker(void *arg)
{
	HnswBuildState *state = (HnswBuildState *) arg;

	/* In a real implementation, this would process work items from a queue */

	return NULL;
}

/*
 * Parallel build implementation
 */
void
hnsw_parallel_build(HnswBuildState *state)
{
	int			i;
	int			num_workers = state->num_workers;

	state->workers = (pthread_t *) palloc(num_workers * sizeof(pthread_t));

	pthread_mutex_init(&state->build_mutex, NULL);
	pthread_cond_init(&state->build_cond, NULL);

	/* Launch worker threads */
	for (i = 0; i < num_workers; i++)
	{
		if (pthread_create(&state->workers[i], NULL, hnsw_build_worker, state) != 0)
		{
			ereport(WARNING,
					(errmsg("could not create thread %d for parallel index build", i)));
			num_workers = i;
			break;
		}
	}

	/* Wait for workers to finish */
	for (i = 0; i < num_workers; i++)
		pthread_join(state->workers[i], NULL);

	/* Cleanup */
	pthread_mutex_destroy(&state->build_mutex);
	pthread_cond_destroy(&state->build_cond);
	pfree(state->workers);
}
