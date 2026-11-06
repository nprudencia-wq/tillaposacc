GRANT USAGE ON SCHEMA auth TO tilla_store_operations;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO tilla_store_operations;