import time
def matmul(A,B,ra,ca,cb):
    C=[0.0]*(ra*cb)
    for i in range(ra):
        for j in range(cb):
            s=0.0
            for k in range(ca):
                s+=A[i*ca+k]*B[k*cb+j]
            C[i*cb+j]=s
    return C
def step(m,d,n,W,X,dY,lr):
    matmul(X,W,m,d,n)                # fwd (output unused; only the compute+write cost is measured)
    # dW = X^T @ dY  -> (d x n)
    dW=[0.0]*(d*n)
    for a in range(d):
        for j in range(n):
            s=0.0
            for i in range(m): s+=X[i*d+a]*dY[i*n+j]
            dW[a*n+j]=s
    # dX = dY @ W^T -> (m x d)
    dX=[0.0]*(m*d)
    for i in range(m):
        for a in range(d):
            s=0.0
            for j in range(n): s+=dY[i*n+j]*W[a*n+j]
            dX[i*d+a]=s
    for t in range(d*n): W[t]-=lr*dW[t]
m,d,n=32,128,512; K=3
W=[0.1]*(d*n); X=[0.5]*(m*d); dY=[0.1]*(m*n)
t0=time.perf_counter()
for _ in range(K): step(m,d,n,W,X,dY,0.01)
t1=time.perf_counter()
print(f"pure-python M={m} D={d} N={n} K={K}  per_step={(t1-t0)/K*1e6:.0f}us")
