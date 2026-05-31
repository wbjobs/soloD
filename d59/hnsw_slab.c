/*-------------------------------------------------------------------------
 *
 * hnsw_slab.c
 *	  Slab allocator for HNSW index - reduces memory fragmentation
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"

/*
 * Create a new slab allocator
 */
HnswSlab *
hnsw_slab_create(MemoryContext parent, size_t object_size, size_t max_allocation)
{
	HnswSlab   *slab;
	MemoryContext slab_cxt;
	
	/* Create dedicated memory context for this slab */
	slab_cxt = AllocSetContextCreate(parent,
									 "HNSW Slab Context",
									 ALLOCSET_DEFAULT_SIZES);
	
	slab = (HnswSlab *) MemoryContextAlloc(slab_cxt, sizeof(HnswSlab));
	slab->memcxt = slab_cxt;
	slab->head = NULL;
	slab->current = NULL;
	slab->total_allocated = 0;
	slab->max_allocation = max_allocation;
	slab->object_size = object_size;
	slab->num_blocks = 0;
	
	/* Pre-allocate first block */
	hnsw_slab_alloc(slab);
	
	return slab;
}

/*
 * Allocate an object from the slab
 */
void *
hnsw_slab_alloc(HnswSlab *slab)
{
	HnswSlabBlock *block;
	void	   *ptr;
	
	/* Check if we have space in current block */
	if (slab->current &&
		slab->current->used + slab->object_size <= slab->current->size)
	{
		ptr = slab->current->data + slab->current->used;
		slab->current->used += slab->object_size;
		return ptr;
	}
	
	/* Need new block */
	size_t block_size = Max(HNSW_SLAB_SIZE, slab->object_size * 100);
	block = (HnswSlabBlock *) MemoryContextAlloc(slab->memcxt,
												  sizeof(HnswSlabBlock) + block_size);
	
	block->next = NULL;
	block->used = 0;
	block->size = block_size;
	
	/* Link to block list */
	if (!slab->head)
	{
		slab->head = block;
		slab->current = block;
	}
	else
	{
		slab->current->next = block;
		slab->current = block;
	}
	
	slab->num_blocks++;
	slab->total_allocated += block_size;
	
	/* Allocate from new block */
	ptr = block->data + block->used;
	block->used += slab->object_size;
	
	return ptr;
}

/*
 * Reset slab - doesn't free memory, just resets pointers for reuse
 */
void
hnsw_slab_reset(HnswSlab *slab)
{
	HnswSlabBlock *block;
	
	for (block = slab->head; block; block = block->next)
		block->used = 0;
	
	slab->current = slab->head;
}

/*
 * Destroy slab and free all associated memory
 */
void
hnsw_slab_destroy(HnswSlab *slab)
{
	if (slab && slab->memcxt)
		MemoryContextDelete(slab->memcxt);
}

/*
 * Get total allocated memory
 */
size_t
hnsw_slab_total_allocated(HnswSlab *slab)
{
	return slab ? slab->total_allocated : 0;
}

/*
 * Check if we're near the memory limit (80% threshold)
 */
bool
hnsw_slab_near_limit(HnswSlab *slab)
{
	if (!slab || slab->max_allocation == 0)
		return false;
	
	return (slab->total_allocated >= slab->max_allocation * 0.8);
}

/*
 * Log memory usage for debugging
 */
void
hnsw_log_memory_usage(const char *context, HnswBuildState *state)
{
	size_t node_mem = 0;
	size_t vector_mem = 0;
	
	if (state && state->node_slab)
		node_mem = hnsw_slab_total_allocated(state->node_slab);
	if (state && state->vector_slab)
		vector_mem = hnsw_slab_total_allocated(state->vector_slab);
	
	ereport(DEBUG1,
			(errmsg("[HNSW] Memory usage at %s: nodes=%zu KB, vectors=%zu KB, "
					"total=%zu KB, limit=%zu KB",
					context,
					node_mem / 1024,
					vector_mem / 1024,
					(node_mem + vector_mem) / 1024,
					state ? state->work_mem_limit / 1024 : 0)));
}
