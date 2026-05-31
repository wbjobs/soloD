-- hnsw extension
-- complain if script is sourced in psql, rather than via CREATE EXTENSION
\echo Use "CREATE EXTENSION hnsw" to load this file. \quit

-- Create the vector type (we'll use array of float4 for simplicity)
-- In a real implementation, we might create a custom type

-- Create the operator class for HNSW index
CREATE OR REPLACE FUNCTION l2_distance(float4[], float4[])
RETURNS float8 AS 'MODULE_PATHNAME', 'l2_distance'
LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION cosine_distance(float4[], float4[])
RETURNS float8 AS 'MODULE_PATHNAME', 'cosine_distance'
LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

-- Create the distance operator for L2 distance
CREATE OPERATOR <-> (
    LEFTARG = float4[],
    RIGHTARG = float4[],
    PROCEDURE = l2_distance,
    COMMUTATOR = <->
);

-- Create the distance operator for cosine distance
CREATE OPERATOR <=> (
    LEFTARG = float4[],
    RIGHTARG = float4[],
    PROCEDURE = cosine_distance,
    COMMUTATOR = <=>
);

-- Create the access method
CREATE OR REPLACE FUNCTION hnswhandler(internal)
RETURNS index_am_handler AS 'MODULE_PATHNAME', 'hnswhandler'
LANGUAGE C;

CREATE ACCESS METHOD hnsw TYPE INDEX HANDLER hnswhandler;

-- Create operator classes for different distance metrics
CREATE OPERATOR CLASS hnsw_l2_ops
DEFAULT FOR TYPE float4[] USING hnsw AS
    OPERATOR 1 <-> (float4[], float4[]) FOR ORDER BY float_ops,
    FUNCTION 1 l2_distance(float4[], float4[]);

CREATE OPERATOR CLASS hnsw_cosine_ops
FOR TYPE float4[] USING hnsw AS
    OPERATOR 1 <=> (float4[], float4[]) FOR ORDER BY float_ops,
    FUNCTION 1 cosine_distance(float4[], float4[]);
